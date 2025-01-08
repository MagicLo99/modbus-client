const ModbusTCP = require('jsmodbus');
const ModbusRTU = require('modbus-serial');

const net = require('net');
// const { parse } = require('path');


/**
 * Get the first argument from the command line
 * @returns {String} The first argument, an empty string if no argument is provided
 */
function getArg() {
	const argument = process.argv[2];
	if (argument) {
		return argument;
	} else {
		return "";
	}
}

/**
 * Parse the Modbus response buffer to a float value
 * @param {Buffer} buffer - Modbus response buffer
 * @param {Object} item - Item object from configuration
 * @returns {Number} Float value
 */
function parseValue(buffer, item) {
	const format = item.format;
	var floatValue =  0.0;

	if (format !== 'ABCD') {
		// Read float value from buffer (little-endian)
		floatValue = buffer.readFloatLE(0);
	} else {
		// default is ABCD
		// Read float value from buffer (big-endian)
		floatValue = buffer.readFloatBE(0);
	}

	const stringValue = floatValue.toString();
	var str = item.evaluatation;
	str = str.replaceAll('value', stringValue);
	// Set the status of the item to "OK"
	item.status = "OK";

	return eval(str);
}


/**
 * Perform Modbus task according to the item configuration
 * @param {Object} client - Modbus client object
 * @param {Object} item - Item object from configuration
 */
function modbusTask(client, item) {
	// Set interval to perform Modbus task
	const interval = setInterval(() => {
		// Check the function code of the item
		if (item.fc.toUpperCase() === "FC3") {
			// Read holding register
			client.readHoldingRegisters(item.registerStart, item.registerLength)
				.then(resp => {
					// Parse the response buffer to a float value
					const val = parseValue(resp.response._body._valuesAsBuffer, item);
					console.log(val);
				})
				.catch(err => {
					// Set the status of the item to "ERROR" if there is an error
					item.status = "ERROR";
					console.error('Error reading holding registers:', err.message);
				});
		} else if (item.fc.toUpperCase() === "FC4") {
			// Read input register
			client.readInputRegisters(item.registerStart, item.registerLength)
				.then((resp) => {
					const val = parseValue(resp.buffer, item);
					console.log(val);
				})
				.catch(err => {
					// Set the status of the item to "ERROR" if there is an error
					item.status = "ERROR";
					console.error('Error reading input registers:');
				});
		} else if (item.fc.toUpperCase() === "FC5") {
			// Write single coil
			client.writeSingleCoil(item.registerStart, item.value)
				.then(resp => {
					// Set the status of the item to "OK" if the write is successful
					item.status = "OK";
				})
				.catch(err => {
					// Set the status of the item to "ERROR" if there is an error
					item.status = "ERROR";
					console.error('Error writing single coil:');
				});
		}
		// If the interval is set to 0, close the client and clear the interval
		if (item.interval === 0) {
			client.close();
			clearInterval(interval);
		} 
	}, item.interval);
}

/**
 * Process Modbus RTU protocol
 * @param {Object} item - Item object from configuration
 */
function processModbusRTU(item) {
	// SerialPort.Binding = Binding;
	const options = {
		path: item.device,
		baudRate: item.baudRate,
		parity: item.parity,
		stopBits: item.stopBits,
		dataBits: item.dataBits,
	};

	// Create a Modbus RTU client
	const client = new ModbusRTU(options);
	client.setID(item.unitId);

	// Connect to the device
	client.connectRTU(item.device, options, () => {
		// Start the Modbus task
		modbusTask(client, item);
	});
}


/**
 * Process Modbus TCP protocol
 * @param {Object} item - Item object from configuration
 */
function processModbusTCP(item) {
	var socket = new net.Socket();
	var client = new ModbusTCP.client.TCP(socket);
	var options = {
		'host': item.host,
		'port': item.port,
	};
	socket.on('connect', function () {
		modbusTask(client, item)
	});
	socket.connect(options);  // 兩個參數可否共用一個socket呢?
}

/**
 * Process parameter from configuration
 * @param {Object} item - Item object from configuration
 * @description Process parameter from configuration, and execute the corresponding function according to the protocol.
 */
function processParam(item) {
	const protocol = item.protocol; // protocol

	if (item.protocol.toUpperCase() === "MODBUSTCP") {
		processModbusTCP(item);
	} else if (item.protocol.toUpperCase() === "MODBUSRTU") {
		processModbusRTU(item);
	}
}

/**
 * Main function
 * @description Read configuration from file, and process each item in configuration
 */
function main() {
	const argument = getArg();
	if (!argument) {
		console.log("No configuration file");
		return;
	}
	const paramObj = require("./" + argument);
	paramObj.parameters.forEach((item, i, arr) => {
		processParam(item);
	});
}

main();