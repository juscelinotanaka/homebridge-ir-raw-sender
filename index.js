var Accessory, Service, Characteristic, UUIDGen, Types, Settings, Consolle;

var storage = require('node-persist');

module.exports = function(homebridge) {
    console.log("homebridge-gpio-device API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    Types = homebridge.hapLegacyTypes;

    Consolle = console;

    Settings = {
        active: Characteristic.Active.ACTIVE,
        state: Characteristic.CurrentHeaterCoolerState.COOLING,
        targetState: Characteristic.TargetHeaterCoolerState.COOL,
        currentTemperature: 20, // this value should come from a sensor
        minTemperature: 16,
        maxTemperature: 31,
        targetTemperature: 19, // this value is shared between heat and cool modes
        swingMode: Characteristic.SwingMode.SWING_ENABLED,
        rotationSpeed: 0,
        isSending: false
    };

	homebridge.registerAccessory("homebridge-ir-raw-sender", "IRSender", DeviceAccesory);
}

function DeviceAccesory(log, config) {
	this.services = [];

	if(!config.name) throw new Error("'name' parameter is missing for IRSender accessory");
	if(!config.pin) throw new Error("'pin' parameter is missing for accessory " + config.name);

	var infoService = new Service.AccessoryInformation();
	infoService.setCharacteristic(Characteristic.Manufacturer, 'Raspberry')
	infoService.setCharacteristic(Characteristic.Model, "IR Sender")
	this.services.push(infoService);

    storage.initSync();
    if (storage.getItemSync('hasData')) {
        Settings.active = storage.getItemSync('active');
        Settings.state = storage.getItemSync('state');
        Settings.targetState = storage.getItemSync('targetState');
        Settings.targetTemperature = storage.getItemSync('targetTemperature');
        Settings.swingMode = storage.getItemSync('swingMode');
        Settings.rotationSpeed = storage.getItemSync('rotationSpeed');
    } else {
        storage.setItemSync('hasData', true);
        storage.setItemSync('active', Settings.active);
        storage.setItemSync('state', Settings.state);
        storage.setItemSync('targetState', Settings.targetState);
        storage.setItemSync('targetTemperature', Settings.targetTemperature);
        storage.setItemSync('swingMode', Settings.swingMode);
        storage.setItemSync('rotationSpeed', Settings.rotationSpeed);
    }

    this.commandParser = new CommandParser(this, log, config);
    this.sender = new IRSender(this, log, config, this.commandParser);

    this.device = new AirCond (this, log, config, this.sender);
}

DeviceAccesory.prototype = {
    getServices: function() {
    	return this.services;
	},

    addService: function(service) {
    	this.services.push(service);
    }
}

function IRSender(accesory, log, config, commandParser) {
    this.log = log;
    this.GPIO=22;
    this.frequency = 38000;
    this.dutyCycle = 0.5;
    this.irSignal = [];
    this.commandParser = commandParser;
}

IRSender.prototype = {
    addPulse: function(on, off, delay) {
        this.irSignal.push([on, off, delay]);
    },

    carrierFrequency: function(pulse) {
        oneCycleTime = 1000000.0 / this.frequency; // 1000000 microseconds in a second
        onDuration = Math.round(oneCycleTime * this.dutyCycle);
        offDuration = Math.round(oneCycleTime * (1.0 - this.dutyCycle));

        totalCycles = Math.round(pulse / oneCycleTime);
        totalPulses = totalCycles * 2;

        for (var i = 0; i < totalPulses; i++) {
            if (i % 2 == 0) {
                 // High pulse
                this.addPulse(1, 0, onDuration);
            } else {
                 // Low pulse
                this.addPulse(0, 1, offDuration);
            }
        }
    },

    gap: function(pulse) {
        this.addPulse(0, 0, pulse);
    },

    generateSignal: function(code) {
        onePulse = 1688;
        zeroPulse = 600;
        startPulse = 7200;

        this.irSignal = [];

        this.carrierFrequency(zeroPulse)
        this.gap(startPulse)

        for (var i = 0; i < code.length; i++) {
            gapPulse = code[i] == "1" ? onePulse : zeroPulse
            this.carrierFrequency(zeroPulse)
            this.gap(gapPulse)
        }
    },

    sendSignal: function() {

        const PigpioClient = require('pigpio-client');
        const pi = new PigpioClient.pigpio({host:'localhost', port:8888});

        storage.setItemSync('active', Settings.active);
        storage.setItemSync('state', Settings.state);
        storage.setItemSync('targetState', Settings.targetState);
        storage.setItemSync('targetTemperature', Settings.targetTemperature);
        storage.setItemSync('swingMode', Settings.swingMode);
        storage.setItemSync('rotationSpeed', Settings.rotationSpeed);

        pi.on('connected', (info) => {
            // configure GPIO25 as input pin and read its level

            // you should monitor for errors
            pi.on('error', (err)=> {
              this.log("ERROR: " + err.message); // or err.stack
            });

            const myPin = pi.gpio(this.GPIO);
            myPin.modeSet('output');

            // this.log("clearing");
            myPin.waveClear();
            // this.log("adding pulse");
            myPin.waveAddPulse(this.irSignal);
            // this.log("creating");
            myPin.waveCreate( (err, wid) => {
                if (err)
                    throw new Error('unexpected pigpio error' + err)

                // this.log("sending once");
                myPin.waveSendOnce(wid, (err, res) => {
                    myPin.waveNotBusy((err, res) => {
                        if (err)
                            throw new Error('unexpected pigpio error' + err)

                        if (res === 1) {
                            this.log('busy! serialport timeout is too short!')
                        } else {
                            // clean up, recycle wids
                            myPin.waveDelete(wid, (err) => {
                                Settings.isSending = false;
                            })
                        }
                    })
                });
            });
        }); //Pi.on 'connected'
    },

    sendCommand: function(code) {
        if (Settings.isSending)
            return;

        Settings.isSending = true;

        code = this.commandParser.getWholeCode();
        this.generateSignal(code);
        this.sendSignal();
    }
}

function CommandParser(accesory, log, config) {
    this.log = log;
}

CommandParser.prototype = {
    k_fan: {
    "AUTO" : "000",
    "LOW"  : "110",
    "MED"  : "010",
    "HIGH" : "100"
    },

    k_flow: {
    "STOP"  : "1",
    "SIDES" : "0"
    },

    k_swing: {
    "STOP"   : "01",
    "UPDOWN" : "10"
    },

    k_power: {
    "ON"   : "1",
    "OFF"  : "0"
    },

    k_mode: {
    "COLD" : "100",
    "HEAT" : "001",
    "FAN"  : "110",
    "DRY"  : "010",
    "AUTO" : "000"
    },

    power: function () {
        return Settings.active == Characteristic.Active.ACTIVE ? "ON" : "OFF";
    },

    swing: function () {
        return Settings.swingMode == Characteristic.SwingMode.SWING_ENABLED
                ? "UPDOWN"
                : "STOP";
    },

    flow: function () {
        return "STOP";
    },

    fan: function() {
        switch (Settings.rotationSpeed) {
            case 0:  return "LOW";
            case 1:  return "MED";
            case 2:  return "HIGH";
            default: return "AUTO";
        }
    },

    mode: function() {
        return Settings.targetState == Characteristic.TargetHeaterCoolerState.COOL
                ? "COLD"
                : "FAN";
    },

    getConf: function () {
        return "0" + this.k_power[this.power()] + this.k_swing[this.swing()] +
        this.k_flow[this.flow()] + this.k_fan[this.fan()];
    },

    getTempMode: function() {
        diff = Settings.targetTemperature - Settings.minTemperature;
        val = (diff).toString(2);

        // the int value is inverted
        inverted = val.split("").reverse().join("");

        // it should always have 4 values XXXX
        missing0 = 4 - val.length;

        for (var i = 0; i < missing0; i++) {
            inverted += "0";
        }

        return inverted + "0" + this.k_mode[this.mode()];
    },

    getEvenChain: function () {
        return [
            "00000000", // header
            "00000000", // header
            "00000000", // botao
            this.getConf(),
            this.getTempMode(),
            "10101011"  // end
        ];
    },

    negateChain: function (v) {
        out = "";
        for (var i = 0; i < v.length; i++) {
            out += v[i] == "0" ? "1" : "0";
        }
        return out
    },

    getWholeCode: function() {
        whole = "";
        evenChain = this.getEvenChain();

        this.log("conf: " + this.mode() + " : " + this.power() + " : " + this.flow() + " : " + this.swing() + " : " + this.fan() + " : " + Settings.targetTemperature);

        for (var i = 0; i < evenChain.length; i++) {
            value = evenChain[i];
            whole += this.negateChain(value) + value;
        }

        whole += "1"

        return whole;
    }

}

function AirCond(accesory, log, config, sender) {
	this.log = log;
	this.pin = config.pin;
    this.sender = sender;
    this.showLog = false;

    // initializing service
	this.service = new Service.HeaterCooler(config.name);
    this.service.getCharacteristic(Characteristic.Active)
        .on('get', this.getActive.bind(this))
        .on('set', this.setActive.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
        .on('get', this.getCurrentHeaterCoolerState.bind(this));

    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
            maxValue: 2,
            minValue: 0,
            validValues: [0,2]
        })
        .on('get', this.getTargetHeaterCoolerState.bind(this))
        .on('set', this.setTargetHeaterCoolerState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCurrentTemperature.bind(this));

    // optional services
    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
            minValue: Settings.minTemperature,
            maxValue: Settings.maxTemperature,
            minStep: 1
        })
        .on('get', this.getCoolingThresholdTemperature.bind(this))
        .on('set', this.setCoolingThresholdTemperature.bind(this));


    this.service.getCharacteristic(Characteristic.SwingMode)
        .on('get', this.getSwing.bind(this))
        .on('set', this.setSwing.bind(this));

    this.service.getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
                minValue: 0,
                maxValue: 2,
                minStep: 1
            })
        .on('get', this.getRotationSpeed.bind(this))
        .on('set', this.setRotationSpeed.bind(this));


    this.service.getCharacteristic(Characteristic.Active).updateValue(Settings.active);
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(Settings.state);
    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(Settings.targetState);
    this.service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(Settings.currentTemperature);

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(Settings.currentTemperature);
    this.service.getCharacteristic(Characteristic.SwingMode).updateValue(Settings.swingMode);
    this.service.getCharacteristic(Characteristic.RotationSpeed).updateValue(Settings.rotationSpeed);

	accesory.addService(this.service);
}

AirCond.prototype = {
    sendNow: function() {
        this.sender.sendCommand();
    },

    getActive: function(callback) {
        if (this.showLog)
            this.log("getActive: " + Settings.active);

        callback(null, Settings.active);
    },

    setActive: function (state, callback) {
        if (this.showLog)
            this.log("set active: " + state);

        Settings.active = state;
        this.sendNow();
        callback();
    },

    getCurrentHeaterCoolerState: function (callback) {
        if (this.showLog)
            this.log("getCurrentHeaterCoolerState: " + Settings.state);

        callback(null, Settings.state);
    },

    getTargetHeaterCoolerState: function (callback) {
        if (this.showLog)
            this.log("getTargetHeaterCoolerState: " + Settings.targetState);
        callback(null, Settings.targetState);
    },

    setTargetHeaterCoolerState: function (state, callback) {

        if (this.showLog)
            this.log("setTargetHeaterCoolerState: " + state);

        Settings.targetState = state;
        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .updateValue(state);

        switch (state) {
            case Characteristic.TargetHeaterCoolerState.AUTO:
                this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                    .updateValue(Characteristic.CurrentHeaterCoolerState.IDLE);
                break;

            case Characteristic.TargetHeaterCoolerState.COOL:
                this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                    .updateValue(Characteristic.CurrentHeaterCoolerState.COOLING);
                break;

            case Characteristic.TargetHeaterCoolerState.HEAT:
                this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                    .updateValue(Characteristic.CurrentHeaterCoolerState.HEATING);
                break;
            default:

        }

        callback();
    },

    getCurrentTemperature: function (callback) {
        if (this.showLog)
            this.log("getCurrentTemperature: " + Settings.targetTemperature);
        callback(null, Settings.targetTemperature);
    },

    getCoolingThresholdTemperature: function (callback) {
        if (this.showLog)
            this.log("getCoolingThresholdTemperature: " + Settings.targetTemperature);
        callback(null, Settings.targetTemperature);
    },

    setCoolingThresholdTemperature: function (temp, callback) {
        if (this.showLog)
            this.log("setCoolingThresholdTemperature: " + temp);

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(temp);
        Settings.targetTemperature = temp;

        this.sendNow();
        callback();
    },

    getSwing: function (callback) {
        if (this.showLog)
            this.log("getSwing: " + Settings.swingMode);

        callback(null, Settings.swingMode);
    },

    setSwing: function (state, callback) {
        if (this.showLog)
            this.log("setSwing: " + state);

        Settings.swingMode = state;

        this.sendNow();
        callback();
    },

    getRotationSpeed: function (callback) {
        if (this.showLog)
            this.log("getRotationSpeed: " + Settings.rotationSpeed);

        callback(null, Settings.rotationSpeed);
    },

    setRotationSpeed: function (speed, callback) {
        if (this.showLog)
            this.log("setRotationSpeed: " + speed);

        Settings.rotationSpeed = speed;
        callback();
    }
}
