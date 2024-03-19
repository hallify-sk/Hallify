import PocketBase from 'pocketbase';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	return {
		addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
		categories: (
			await (locals.pb as PocketBase)
				.collection('stage_categories')
				.getFullList({ sort: 'created' })
		).map((i) => {
			return { id: i.id, name: i.name };
		}),
		templates: 
			(await (locals.pb as PocketBase)
				.collection('stage_templates')
				.getFullList())
	};
}
