import { serializeNonPOJOs } from '$lib/lib';
import { fail } from '@sveltejs/kit';

export const actions: import('./$types').Actions = {
	saveChanges: async ({ locals, request }) => {
		const data = await request.formData();
		const stageConfig = await locals.pb
			.collection('config')
			.getFullList({ filter: 'label="stage"' });
		let newData;
		var object: { [key: string]: string } = {};
		data.forEach(function (value, key) {
			if (key == 'toggleModule') return;
			object[key] = value.toString();
		});
		try {
			var json = JSON.stringify(object);
			if (stageConfig[0]) {
				//If only toggleModule is updated, don't update the value
				if (stageConfig[0].enabled != (data.get('toggleModule') == 'on')) {
					json = JSON.stringify(stageConfig[0].value);
				}
				newData = await locals.pb
					.collection('config')
					.update(stageConfig[0].id, {
						label: 'stage',
						value: json,
						enabled: data.get('toggleModule') === 'on'
					});
			} else {
				newData = await locals.pb
					.collection('config')
					.create({ label: 'stage', value: json, enabled: data.get('toggleModule') === 'on' });
			}
		} catch (e) {
			throw fail(500);
		}
		return {
			config: newData
		};
	}
};

/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({ locals }) {
	return {
		user: locals.user,
		config: await locals.pb.collection('config').getFullList({ filter: 'label="stage"' }),
		apiUrl: locals.pbApiURL
	};
}
