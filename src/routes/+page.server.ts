export const actions = {
	login: async ({ request, getClientAddress, locals }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString();
		const password = formData.get('password')?.toString();
		const user = await locals.pb.collection("users").authWithPassword(email || "", password || "");
		return { user };
	}
};

/** @type {import('./$types').PageServerLoad} */
export async function load({locals}) {
	return {
		stages: await locals.pb.collection('stages').getFullList({ sort: 'created' })
	};
}
