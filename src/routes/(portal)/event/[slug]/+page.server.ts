import { error } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
	let reservation;
	try{
		reservation = await (locals.pb as PocketBase).collection("temp_reservations").getOne(params.slug, {expand: "category"});
	}catch(e){
		try{
			reservation = await (locals.pb as PocketBase).collection("reservations").getOne(params.slug);
		}catch(e){
			return error(404, {
				message: "Not found"
			});
		}
	}
	console.log(reservation);
	return {
		reservation: reservation,
		addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
	};
}
