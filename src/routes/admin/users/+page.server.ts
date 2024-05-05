import { serializeNonPOJOs } from '$lib/lib';
import { fail } from '@sveltejs/kit';

export const actions: import('./$types').Actions = {
	getMoreUsers: async({locals, request}) => {
        const data = await request.formData()
        const page = data.get("page")?.toString();
        if(!page) return fail(400);
        if(isNaN(parseInt(page))) return fail(400);
        const users = await locals.pb.collection("users").getList(parseInt(page), 50, { sort: 'created', expand: 'user,addons,category' });
        if(!users.items.length) return fail(404);
        return {
            users: serializeNonPOJOs(users)
        }
    },
    removeUsers: async({locals, request}) => {
        const formData = await request.formData();
        console.log(formData);
        const reason = formData.get("reason")?.toString();
        const checkboxes = formData.get("checkboxes")?.toString();

        const parsedCheckboxes = JSON.parse(checkboxes || "[]");
        if(!parsedCheckboxes.length || !reason) return fail(400);
        for(let i = 0; i < parsedCheckboxes.length; i++){
            await locals.pb.collection("users").delete(parsedCheckboxes[i]);
        };
        return {success: true};
    },
};

/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({ locals }) {
	return {
		user: locals.user,
		users: await locals.pb
		.collection('users')
		.getList(0, 50, { sort: 'created', expand: 'user,addons,category' }),
		apiUrl: locals.pbApiURL
	};
}
