import { SECRET_TURNSTILE_TOKEN } from '$env/static/private';
import { PUBLIC_DEV, PUBLIC_TURNSTILE_URL } from '$env/static/public';
import { fail, redirect,  } from '@sveltejs/kit';

export const actions = {
	login: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get("cf-turnstile-response")?.toString();
		if(!email || email.trim() == ""){
			return fail(400);
		}
		if(!password || password.trim() == ""){
			return fail(400);
		}
		const formData = new FormData();
		if(PUBLIC_DEV == "true") {
            formData.append("secret", SECRET_TURNSTILE_TOKEN)
            formData.append("response", turnstile as string)
            formData.append('remoteip', getClientAddress());
            const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
                body: formData,
                method: 'POST',
            });
            const outcome = await result.json();
            if(!outcome.success) return fail(400, { turnstileData: { incorrect: true, message: "CAPTCHA failed! Please refresh this page."} });
        }
		try{
			await locals.pb.collection("users").authWithPassword(email, password);
			return {success: true};
		}catch(e){
			return fail(400, {authData: { incorrect: true, message: "E-mail doesn't exist or password was incorrect."}});
		};
	}
};

/** @type {import('./$types').PageServerLoad} */
export async function load({locals}) {
	return {
		stages: await locals.pb.collection('stages').getFullList({ sort: 'created' })
	};
}
