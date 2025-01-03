const SerialPort = require('serialport').SerialPort;
const Modbus = require('jsmodbus');
const dgram = require('dgram');
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

function parseValue(resp, item) {
	var registers = resp.response._body.valuesAsArray;
	// Create a buffer of 4 bytes (32 bits). One word is 2 bytes
	var buffer = Buffer.alloc(item.registerLength * 2);

	for (var i = 0; i < registers.length; i++) {
		buffer.writeUInt16BE(registers[i], i * 2);
	}

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
					parseValue(resp, item);
				})
				.catch(err => {
					item.status = "ERROR";
					console.error('Error reading holding registers:', err.message);
				});
		} else if (item.fc.toUpperCase() === "FC4") {
			// read input register
			client.readInputRegisters(item.registerStart, item.registerLength)
				.then(resp => parseValue(resp, item))
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
	const serialPort = new SerialPort({
		path: item.device,
		baudRate: item.baudRate,
		parity: item.parity,
		stopBits: item.stopBits,
		dataBits: item.dataBits,
		endOnClose: true, 
		autoOpen: true
	});

	serialPort.on('open', function () {
        console.log('Serial port opened');
		const client = new Modbus.client.RTU(serialPort, item.unitId);
		modbusTask(client, item);
		// 	// Set a timeout for the serial port
		// 	// timeout = setTimeout(() => {
		// 	// 	// console.error('Serial port timeout');
		// 	// }, item.interval);
    });

	serialPort.on('data',  (data)=> {
		console.log('Data received', data);
		// Reset the timeout on data received
		// clearTimeout(timeout);
		// timeout = setTimeout(() => {
		// 	// console.error('Serial port timeout');
		// 	// serialPort.close();
		// }, item.interval);
	});

	serialPort.on('error',  (err) =>{
		console.error('Error: ', err.message);
	});

	serialPort.on('close', function () {
		console.log('Serial port closed');
	});
}

/**
 * Process Modbus TCP protocol
 * @param {Object} item - Item object from configuration
 */
function processModbusTCP(item) {
	var socket = new net.Socket();
	var client = new Modbus.client.TCP(socket);
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