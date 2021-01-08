import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv'
import schedule from 'node-schedule';
import convert from 'xml-js';
import inside from 'point-in-polygon'
import moment from 'moment';
import Redis from 'ioredis';
import AtcOnline from './models/AtcOnline.js';
import AtisOnline from './models/AtisOnline.js';
import PilotOnline from './models/PilotOnline.js';
import Pireps from './models/Pireps.js';
import ControllerHours from './models/ControllerHours.js';

mongoose.set('useFindAndModify', false);

dotenv.config();

const redis = new Redis(process.env.REDIS_URI);

const atcPos = ["PHX", "ABQ", "TUS", "AMA", "ROW", "ELP", "SDL", "CHD", "FFZ", "IWA", "DVT", "GEU", "GYR", "LUF", "RYN", "DMA", "FLG", "PRC", "AEG", "BIF", "HMN", "SAF", "FHU"];
const airports = ["KPHX", "KABQ", "KTUS", "KAMA", "KROW", "KELP", "KSDL", "KCHD", "KFFZ", "KIWA", "KDVT", "KGEU", "KGYR", "KLUF", "KRYN", "KDMA", "KFLG", "KPRC", "KAEG", "KBIF", "KHMN", "KSAF", "KFHU"];
const neighbors = ['LAX', 'DEN', 'KC', 'FTW', 'HOU', 'MMTY', 'MMTZ'];
const airspace = [
	[37.041667, -102.183333],
	[36.5, -101.75],
	[36.397222, -101.472222],
	[36.275, -101.133333],
	[35.9125, -100.211667],
	[35.829167, -100],
	[35.678611, -100],
	[35.333333, -100],
	[35.129167, -100.141667],
	[34.866667, -100.316667],
	[34.466667, -100.75],
	[34.491667, -101],
	[34.55, -101.541667],
	[34.6, -102],
	[34.55, -102.325],
	[34.388889, -102.6625],
	[34.316667, -102.8],
	[33.775, -103.366667],
	[33.6375, -103.4875],
	[33.402778, -103.691667],
	[33.383333, -103.8],
	[33.05, -103.8],
	[33, -103.8],
	[32.845833, -103.840278],
	[32.466667, -103.933333],
	[32.033333, -103.8],
	[31.808333, -103.529167],
	[31.65, -103.333333],
	[31.583333, -103.116667],
	[31.425, -102.216667],
	[31.283333, -102.15],
	[29.733611, -102.675556],
	[29.5225, -102.800556],
	[29.400278, -102.817222],
	[29.350278, -102.883889],
	[29.266944, -102.900556],
	[29.2225, -102.867222],
	[29.166944, -103.000556],
	[28.950278, -103.150556],
	[28.991944, -103.283889],
	[29.016944, -103.383889],
	[29.066944, -103.450556],
	[29.150278, -103.550556],
	[29.183611, -103.683889],
	[29.185278, -103.708889],
	[29.266944, -103.783889],
	[29.316944, -104.000556],
	[29.400278, -104.150556],
	[29.483611, -104.217222],
	[29.533611, -104.350556],
	[29.648333, -104.517778],
	[29.758611, -104.567222],
	[30.000278, -104.700556],
	[30.150278, -104.683889],
	[30.266667, -104.75],
	[30.366944, -104.833889],
	[30.550278, -104.900556],
	[30.600278, -104.967222],
	[30.683611, -104.983889],
	[30.683611, -105.050556],
	[30.787778, -105.200556],
	[30.833333, -105.317222],
	[31, -105.550556],
	[31.1, -105.650556],
	[31.166667, -105.783889],
	[31.283333, -105.883889],
	[31.341667, -105.951667],
	[31.383333, -106.000556],
	[31.466667, -106.200556],
	[31.666667, -106.333333],
	[31.733333, -106.383889],
	[31.75, -106.500556],
	[31.783333, -106.533889],
	[31.784335, -106.571657],
	[31.788324, -106.71252],
	[31.78947, -106.774294],
	[31.804254, -107.528889],
	[31.816667, -108.2],
	[31.333333, -108.2],
	[31.333333, -108.5],
	[31.333333, -109.352778],
	[31.333333, -110.75],
	[31.333307, -111.05],
	[31.333303, -111.100039],
	[31.368044, -111.186097],
	[31.516667, -111.641667],
	[31.633333, -112],
	[31.973719, -113.092358],
	[32.1, -113.508333],
	[32.7375, -113.684722],
	[32.683333, -114],
	[32.866667, -114],
	[33.083333, -114],
	[33.4, -114],
	[34.666667, -114],
	[34.916667, -113.616667],
	[35.379722, -112.666667],
	[35.417778, -112.153056],
	[35.438056, -112],
	[35.766667, -111.841667],
	[35.7, -110.233333],
	[35.85, -109.316667],
	[36.033333, -108.216667],
	[36.2, -107.466667],
	[36.626944, -106.35],
	[36.716667, -106.083333],
	[36.716667, -105.341667],
	[36.716667, -105],
	[37.045278, -104],
	[37.1625, -103.619444],
	[37.5, -102.55],
	[37.041667, -102.183333],
];


mongoose.set('toJSON', {virtuals: true});
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.once('open', () => console.log('Successfully connected to MongoDB'));

const pollVatsim = async () => {
	await AtcOnline.deleteMany({}).exec();
	await PilotOnline.deleteMany({}).exec();
	await AtisOnline.deleteMany({}).exec();
	let twoHours = new Date();
	twoHours = new Date(twoHours.setHours(twoHours.getHours() - 2));
	await Pireps.deleteMany({$or: [{manual: false}, {reportTime: {$lte: twoHours}}]}).exec();
	console.log("Fetching data from VATISM.")
	const {data} = await axios.get('https://data.vatsim.net/v3/vatsim-data.json');

	// PILOTS
	
	const dataPilots = [];
	
	let redisPilots = await redis.get('pilots');
	redisPilots = (redisPilots && redisPilots.length) ? redisPilots.split('|') : [];

	for(const pilot of data.pilots) { // Get all pilots that depart/arrive in ARTCC's airspace
		if(pilot.flight_plan !== null && (airports.includes(pilot.flight_plan.departure) || airports.includes(pilot.flight_plan.arrival))) {
			await PilotOnline.create({
				cid: pilot.cid,
				name: pilot.name,
				callsign: pilot.callsign,
				aircraft: pilot.flight_plan.aircraft.substring(0, 8),
				dep: pilot.flight_plan.departure,
				dest: pilot.flight_plan.arrival,
				code: Math.floor(Math.random() * (999 - 101) + 101),
				lat: pilot.latitude,
				lng: pilot.longitude,
				altitude: pilot.altitude,
				heading: pilot.heading,
				speed: pilot.groundspeed,
				planned_cruise: pilot.flight_plan.altitude.includes("FL") ? (pilot.flight_plan.altitude.replace("FL", "") + '00') : pilot.flight_plan.altitude, // If flight plan altitude is 'FL350' instead of '35000'
				route: pilot.flight_plan.route,
				remarks: pilot.flight_plan.remarks
			});

			dataPilots.push(pilot.callsign);
			
			redis.hmset(`PILOT:${pilot.callsign}`,
				'callsign', pilot.callsign,
				'lat',  `${pilot.latitude}`,
				'lng',  `${pilot.longitude}`,
				'speed', `${pilot.groundspeed}`,
				'heading', `${pilot.heading}`,
				'altitude', `${pilot.altitude}`,
				'cruise', `${pilot.flight_plan.altitude}`,
				'destination', `${pilot.flight_plan.arrival}`,
			);
			redis.publish('PILOT:UPDATE', pilot.callsign);

		} /* else if(pilot.flight_plan !== null && inside([pilot.latitude, pilot.longitude], airspace) == true) {
			await PilotOnline.create({
				cid: pilot.cid,
				name: pilot.name,
				callsign: pilot.callsign,
				aircraft: pilot.flight_plan.aircraft.substring(0, 8),
				dep: pilot.flight_plan.departure,
				dest: pilot.flight_plan.arrival,
				code: Math.floor(Math.random() * (999 - 101) + 101),
				lat: pilot.latitude,
				lng: pilot.longitude,
				altitude: pilot.altitude,
				heading: pilot.heading,
				speed: pilot.groundspeed,
				planned_cruise: pilot.flight_plan.altitude.includes("FL") ? (pilot.flight_plan.altitude.replace("FL", "") + '00') : pilot.flight_plan.altitude, // If flight plan altitude is 'FL350' instead of '35000'
				route: pilot.flight_plan.route,
				remarks: pilot.flight_plan.remarks
			});
		} */
	};

	for(const pilot of redisPilots) {
		if(!dataPilots.includes(pilot)) {
			redis.publish('PILOT:DELETE', pilot)
		}
	}

	redis.set('pilots', dataPilots.join('|'));
	redis.expire(`pilots`, 65);
	
	// CONTROLLERS
	const dataControllers = [];
	let redisControllers = await redis.get('controllers');
	redisControllers = (redisControllers && redisControllers.length) ? redisControllers.split('|') : [];

	const dataNeighbors = [];
	let redisNeighbors = await redis.get('neighbors');
	redisNeighbors = (redisNeighbors && redisNeighbors.length) ? redisNeighbors.split('|') : [];

	for(const controller of data.controllers) { // Get all controllers that are online in ARTCC's airspace
		if(atcPos.includes(controller.callsign.slice(0, 3)) && controller.callsign !== "PRC_FSS") {
			await AtcOnline.create({
				cid: controller.cid,
				name: controller.name,
				rating: controller.rating,
				pos: controller.callsign,
				timeStart: controller.logon_time,
				atis: controller.text_atis ? controller.text_atis.join(' - ') : '',
				frequency: controller.frequency
			})

			dataControllers.push(controller.callsign);
	
			const session = await ControllerHours.findOne({
				cid: controller.cid,
				timeStart: controller.logon_time
			})
	
			if(!session) {
				await ControllerHours.create({
					cid: controller.cid,
					timeStart: controller.logon_time,
					timeEnd: moment().utc(),
					position: controller.callsign
				})
			} else {
				session.timeEnd = moment().utc();
				await session.save();
			}
		}
		const callsignParts = controller.callsign.split('_');
		if(neighbors.includes(callsignParts[0]) && callsignParts[callsignParts.length - 1] === "CTR") { // neighboring center
			dataNeighbors.push(callsignParts[0])
		}
	};

	for(const atc of redisControllers) {
		if(!dataControllers.includes(atc)) {
			redis.publish('CONTROLLER:DELETE', atc)
		}
	}

	redis.set('controllers', dataControllers.join('|'));
	redis.expire(`controllers`, 65);
	redis.set('neighbors', dataNeighbors.join('|'));
	redis.expire(`neighbors`, 65);

	// METARS

	const airportsString = airports.join(","); // Get all METARs, add to database
	const response = await axios.get(`https://metar.vatsim.net/${airportsString}`);
	const metars = response.data.split("\n");

	for(const metar of metars) {
		await AtisOnline.create({
			airport: metar.slice(0,4),
			metar: metar
		});
		redis.set(`METAR:${metar.slice(0,4)}`, metar);
	}

	// ATIS

	const dataAtis = []
	let redisAtis = await redis.get('atis')
	redisAtis = (redisAtis && redisAtis.length) ? redisAtis.split('|') : [];

	for(const atis of data.atis) { // Find all ATIS connections within ARTCC's airspace
		const airport = atis.callsign.slice(0,4)
		if(airports.includes(airport)) {
			dataAtis.push(airport);
			redis.expire(`ATIS:${airport}`, 65)
		}
	}

	for(const atis of redisAtis) {
		if(!dataAtis.includes(atis)) {
			redis.publish('ATIS:DELETE', atis)
			redis.del(`ATIS:${atis}`);
		}
	}

	redis.set('atis', dataAtis.join('|'));
	redis.expire(`atis`, 65);
}

const getPireps = async () => {
	const pirepsXml = await axios.get('https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=aircraftreports&requestType=retrieve&format=xml&minLat=30&minLon=-113&maxLat=37&maxLon=-100&hoursBeforeNow=2');
	const pirepsJson = JSON.parse(convert.xml2json(pirepsXml.data, {compact: true, spaces: 4}));
	if(pirepsJson.response.data.AircraftReport && pirepsJson.response.data.AircraftReport.constructor !== Array) {
		const pirep = pirepsJson.response.data.AircraftReport;
		if(pirep.report_type && pirep.report_type._text === 'PIREP') {
			const windDir = pirep.wind_dir_degrees ? pirep.wind_dir_degrees._text : '';
			const windSpd =  pirep.wind_speed_kt ? pirep.wind_speed_kt._text : '';
			const wind = `${windDir}${pirep.wind_speed_kt ? '@' : ''}${windSpd}`;
			const icing =  (pirep.icing_condition && pirep.icing_condition._attributes) ? (`${pirep.icing_condition._attributes.icing_intensity ? pirep.icing_condition._attributes.icing_intensity.slice(0,3) : ''} ${pirep.icing_condition._attributes.type ? pirep.icing_condition._attributes.type : ''} ${pirep.icing_condition._attributes.icing_base_ft_msl ? (('000' + Math.round(pirep.icing_condition._attributes.icing_base_ft_msl / 100)).toString()).slice(-3) : ''}${pirep.icing_condition._attributes.icing_top_ft_msl ? '-' + (('000' + Math.round(pirep.icing_condition._attributes.icing_top_ft_msl / 100)).toString()).slice(-3) : ''}`).replace(/\s+/g,' ').trim() : '';
			
			await Pireps.create({
				reportTime: pirep.observation_time._text,
				location: pirep.raw_text._text.slice(0,3),
				aircraft: pirep.aircraft_ref._text,
				flightLevel: pirep.altitude_ft_msl ? (('000' + Math.round(pirep.altitude_ft_msl._text / 100)).toString()).slice(-3) : '',
				skyCond: pirep.sky_condition._attributes ? `${pirep.sky_condition._attributes.sky_cover ? pirep.sky_condition._attributes.sky_cover : ''} ${pirep.sky_condition._attributes.cloud_base_ft_msl ? (('000' + Math.round(pirep.sky_condition._attributes.cloud_base_ft_msl / 100)).toString()).slice(-3) : ''}${pirep.sky_condition._attributes.cloud_top_ft_msl ? '-' + (('000' + Math.round(pirep.sky_condition._attributes.cloud_top_ft_msl / 100)).toString()).slice(-3) : ''}` : '',
				turbulence: (pirep.turbulence_condition && pirep.turbulence_condition._attributes) ? `${pirep.turbulence_condition._attributes.turbulence_intensity} ${pirep.turbulence_condition._attributes.turbulence_freq ? pirep.turbulence_condition._attributes.turbulence_freq : ''} ${pirep.turbulence_condition._attributes.turbulence_type ? pirep.turbulence_condition._attributes.turbulence_type : ''}`.replace(/\s+/g,' ').trim() : '',
				icing: icing,
				vis: pirep.visibility_statute_mi ? pirep.visibility_statute_mi._text : '',
				temp: pirep.temp_c ? pirep.temp_c._text : '',
				wind: wind,
				urgent: pirep.report_type._text === 'Urgent PIREP' ? true : false,
				raw: pirep.raw_text._text,
				manual: false
			});
		}
	} else if(pirepsJson.response.data.AircraftReport && pirepsJson.response.data.AircraftReport) {
		for(const pirep of pirepsJson.response.data.AircraftReport) {
			if(pirep.report_type._text === 'PIREP') {
				const windDir = pirep.wind_dir_degrees ? pirep.wind_dir_degrees._text : '';
				const windSpd =  pirep.wind_speed_kt ? pirep.wind_speed_kt._text : '';
				const wind = `${windDir}${pirep.wind_speed_kt ? '@' : ''}${windSpd}`;
				const icing =  (pirep.icing_condition && pirep.icing_condition._attributes) ? (`${pirep.icing_condition._attributes.icing_intensity ? pirep.icing_condition._attributes.icing_intensity.slice(0,3) : ''} ${pirep.icing_condition._attributes.type ? pirep.icing_condition._attributes.type : ''} ${pirep.icing_condition._attributes.icing_base_ft_msl ? (('000' + Math.round(pirep.icing_condition._attributes.icing_base_ft_msl / 100)).toString()).slice(-3) : ''}${pirep.icing_condition._attributes.icing_top_ft_msl ? '-' + (('000' + Math.round(pirep.icing_condition._attributes.icing_top_ft_msl / 100)).toString()).slice(-3) : ''}`).replace(/\s+/g,' ').trim() : '';
				
				await Pireps.create({
					reportTime: pirep.observation_time._text,
					location: pirep.raw_text._text.slice(0,3),
					aircraft: pirep.aircraft_ref._text,
					flightLevel: pirep.altitude_ft_msl ? (('000' + Math.round(pirep.altitude_ft_msl._text / 100)).toString()).slice(-3) : '',
					skyCond: pirep.sky_condition._attributes ? `${pirep.sky_condition._attributes.sky_cover ? pirep.sky_condition._attributes.sky_cover : ''} ${pirep.sky_condition._attributes.cloud_base_ft_msl ? (('000' + Math.round(pirep.sky_condition._attributes.cloud_base_ft_msl / 100)).toString()).slice(-3) : ''}${pirep.sky_condition._attributes.cloud_top_ft_msl ? '-' + (('000' + Math.round(pirep.sky_condition._attributes.cloud_top_ft_msl / 100)).toString()).slice(-3) : ''}` : '',
					turbulence: (pirep.turbulence_condition && pirep.turbulence_condition._attributes) ? `${pirep.turbulence_condition._attributes.turbulence_intensity} ${pirep.turbulence_condition._attributes.turbulence_freq ? pirep.turbulence_condition._attributes.turbulence_freq : ''} ${pirep.turbulence_condition._attributes.turbulence_type ? pirep.turbulence_condition._attributes.turbulence_type : ''}`.replace(/\s+/g,' ').trim() : '',
					icing: icing,
					vis: pirep.visibility_statute_mi ? pirep.visibility_statute_mi._text : '',
					temp: pirep.temp_c ? pirep.temp_c._text : '',
					wind: wind,
					urgent: pirep.report_type._text === 'Urgent PIREP' ? true : false,
					raw: pirep.raw_text._text,
					manual: false
				});
			}
		}
	}
}


(async () =>{
	await redis.set('airports', airports.join('|'));
	await pollVatsim();
	await getPireps();
	schedule.scheduleJob('* * * * *', pollVatsim) // run every minute
	schedule.scheduleJob('*/2 * * * *', getPireps) // run every 2 minutes
})();

	

	

//https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=aircraftreports&requestType=retrieve&format=xml&minLat=30&minLon=-113&maxLat=37&maxLon=-100&hoursBeforeNow=2