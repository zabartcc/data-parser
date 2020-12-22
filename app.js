import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv'
import schedule from 'node-schedule';
import convert from 'xml-js';
import moment from 'moment';
import AtcOnline from './models/AtcOnline.js';
import AtisOnline from './models/AtisOnline.js';
import PilotOnline from './models/PilotOnline.js';
import Pireps from './models/Pireps.js';
import ControllerHours from './models/ControllerHours.js';

mongoose.set('useFindAndModify', false);


dotenv.config();

const atcPos = ["PHX", "ABQ", "TUS", "AMA", "ROW", "ELP", "SDL", "CHD", "FFZ", "IWA", "DVT", "GEU", "GYR", "LUF", "RYN", "DMA", "FLG", "PRC", "AEG", "BIF", "HMN", "SAF", "FHU"];
const airports = ["KPHX", "KABQ", "KTUS", "KAMA", "KROW", "KELP", "KSDL", "KCHD", "KFFZ", "KIWA", "KDVT", "KGEU", "KGYR", "KLUF", "KRYN", "KDMA", "KFLG", "KPRC", "KAEG", "KBIF", "KHMN", "KSAF", "KFHU"];

mongoose.set('toJSON', {virtuals: true});
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.once('open', () => console.log('Successfully connected to MongoDB'));

schedule.scheduleJob('*/2 * * * *', async () => { // run every 2 minutes
	await AtcOnline.deleteMany({}).exec();
	await PilotOnline.deleteMany({}).exec();
	await AtisOnline.deleteMany({}).exec();
	await Pireps.deleteMany({}).exec();
	console.log("Fetching data from VATISM.")
	
	const {data} = await axios.get('https://data.vatsim.net/v3/vatsim-data.json');

	for(const pilot of data.pilots) { // Get all pilots that depart/arrive in ARTCC's airspace
		if(pilot.flight_plan !== null && (airports.includes(pilot.flight_plan.departure) || airports.includes(pilot.flight_plan.arrival))) {
			await PilotOnline.create({
				cid: pilot.cid,
				name: pilot.name,
				callsign: pilot.callsign,
				aircraft: pilot.flight_plan.aircraft.substring(0, 8),
				dep: pilot.flight_plan.departure,
				dest: pilot.flight_plan.arrival,
				lat: pilot.latitude,
				lng: pilot.longitude,
				altitude: pilot.altitude,
				heading: pilot.heading,
				speed: pilot.groundspeed,
				planned_cruise: pilot.flight_plan.altitude,
				route: pilot.flight_plan.route,
				remarks: pilot.flight_plan.remarks
			});
		}
	};

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
	};

	const airportsString = airports.join(","); // Get all METARs, add to database
	const response = await axios.get(`https://metar.vatsim.net/${airportsString}`);
	const metars = response.data.split("\n");

	for(const metar of metars) {
		await AtisOnline.create({
			airport: metar.slice(0,4),
			metar: metar
		});
	}

	for(const atis of data.atis) { // Find all ATIS connections within ARTCC's airspace
		if(airports.includes(atis.callsign.slice(0,4))) {
			 await AtisOnline.findOneAndUpdate({airport: atis.callsign.slice(0,4)}, {
				cid: atis.cid,
				callsign: atis.callsign,
				code: atis.atis_code,
				text:  atis.text_atis ? atis.text_atis.join(' - ') : '',
			});
		}
	}

	const pirepsXml = await axios.get('https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=aircraftreports&requestType=retrieve&format=xml&minLat=30&minLon=-113&maxLat=37&maxLon=-100&hoursBeforeNow=2');
	const pirepsJson = JSON.parse(convert.xml2json(pirepsXml.data, {compact: true, spaces: 4}));
	if(pirepsJson.response.data.AircraftReport.isArray !== true) {
		const pirep = pirepsJson.response.data.AircraftReport;
		if(pirep.report_type._text === 'PIREP') {
			await Pireps.create({
				reportTime: pirep.observation_time._text,
				aircraft: pirep.aircraft_ref._text,
				flightLevel: pirep.altitude_ft_msl._text,
				skyCond: pirep.sky_condition ? `${pirep.sky_condition._attributes.sky_cover} ${pirep.sky_condition._attributes.cloud_base_ft_msl}-${pirep.sky_condition._attributes.cloud_top_ft_msl}` : '',
				turbulence: pirep.turbulence_condition ? pirep.turbulence_condition._attributes.turbulence_intensity : '',
				icing: pirep.icing_condition ? `${pirep.icing_condition._attributes.icing_intensity.slice(0,3)} ${('0' + pirep.icing_condition._attributes.icing_base_ft_msl).slice(0,-2)}${pirep.icing_condition._attributes.icing_top_ft_msl ? '-' + pirep.icing_condition._attributes.icing_top_ft_msl : ''}` : '',
				vis: pirep.visibility_statute_mi ? pirep.visibility_statute_mi._text : '',
				temp: pirep.temp_c ? pirep.temp_c._text : '',
				windDir: pirep.wind_dir_degrees ? pirep.wind_dir_degrees._text : '',
				windSpd: pirep.wind_speed_kt ? pirep.wind_speed_kt._text : '',
				urgent: pirep.report_type._text === 'Urgent PIREP' ? true : false,
				raw: pirep.raw_text._text,
				manual: false
			});
		}
	} else {
		for(const pirep of pirepsJson.response.data.AircraftReport) {
			if(pirep.report_type._text === 'PIREP') {
				await Pireps.create({
					reportTime: pirep.observation_time._text,
					aircraft: pirep.aircraft_ref._text,
					flightLevel: pirep.altitude_ft_msl._text,
					skyCond: pirep.sky_condition ? `${pirep.sky_condition._attributes.sky_cover} ${pirep.sky_condition._attributes.cloud_base_ft_msl}-${pirep.sky_condition._attributes.cloud_top_ft_msl}` : '',
					turbulence: pirep.turbulence_condition ? pirep.turbulence_condition._attributes.turbulence_intensity : '',
					icing: pirep.icing_condition ? `${pirep.icing_condition._attributes.icing_intensity.slice(0,3)} ${pirep.icing_condition._attributes.icing_base_ft_msl.slice(-2)}-${pirep.icing_condition._attributes.icing_top_ft_msl}` : '',
					vis: pirep.visibility_statute_mi ? pirep.visibility_statute_mi._text : '',
					temp: pirep.temp_c ? pirep.temp_c._text : '',
					windDir: pirep.wind_dir_degrees ? pirep.wind_dir_degrees._text : '',
					windSpd: pirep.wind_speed_kt ? pirep.wind_speed_kt._text : '',
					urgent: pirep.report_type._text === 'Urgent PIREP' ? true : false,
					raw: pirep.raw_text._text,
					manual: false
				});
			}
		}
	}

});

//https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=aircraftreports&requestType=retrieve&format=xml&minLat=30&minLon=-113&maxLat=37&maxLon=-100&hoursBeforeNow=2