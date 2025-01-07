const ModbusTCP = require('jsmodbus');
const ModbusRTU = require('modbus-serial');

const net = require('net');
// const { parse } = require('path');

/**
 * Get argument from command line argument
 * @returns {String} Argument
 */
function getArg() {
	const argument = process.argv[2];
	if (argument) {
		return argument;
	} else {
		return "";
	}
}

function parseValue(buffer, item) {
	// var registers = resp;
	// Create a buffer of 4 bytes (32 bits). One word is 2 bytes
	// var buffer = Buffer.alloc(item.registerLength * 2);

	// for (var i = 0; i < registers.length; i++) {
	// 	buffer.writeUInt16BE(registers[i], i * 2);
	// }

	if (item.format !== 'ABCD') {
		var floatValue = buffer.readFloatLE(0);
	} else {
		// default is ABCD
		// Convert buffer to float (big-endian)
		var floatValue = buffer.readFloatBE(0);
		
	}

	console.log(floatValue);
	item.status = "OK";
}

function modbusTask(client, item) {
	interval = setInterval(() => {
		if (item.fc.toUpperCase() === "FC3") {
			// read holding register
			client.readHoldingRegisters(item.registerStart, item.registerLength)
				.then(resp => {
					parseValue(resp.response._body._valuesAsBuffer, item);
				})
				.catch(err => {
					item.status = "ERROR";
					console.error('Error reading holding registers:', err.message);
				});
		} else if (item.fc.toUpperCase() === "FC4") {
			// read input register
			client.readInputRegisters(item.registerStart, item.registerLength)
				.then(resp => parseValue(resp.buffer, item))
				.catch(err => {
					item.status = "ERROR";
					console.error('Error reading input registers:');
				});
		} else if (item.fc.toUpperCase() === "FC5") {
			// write single coil
			client.writeSingleCoil(item.registerStart, item.value)
				.then(resp => {
					item.status = "OK";
				})
				.catch(err => {
					item.status = "ERROR";
					console.error('Error writing single coil:');
				});
		};
		if (item.interval === 0){
			client.close();
			clearInterval(interval);
		} 
	}, item.interval);
}

// Function to process Modbus RTU
function processModbusRTU(item) {
	// SerialPort.Binding = Binding;
	const options = {
		path: item.device,
		baudRate: item.baudRate,
		parity: item.parity,
		stopBits: item.stopBits,
		dataBits: item.dataBits,
	};

	const client = new ModbusRTU(options);
	client.setID(item.unitId);
	client.connectRTU(item.device, options, () => {
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