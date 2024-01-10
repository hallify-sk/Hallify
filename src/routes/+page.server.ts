import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	return {
		stages: await pb.collection("stages").getFullList({sort: "created"})
	};
}