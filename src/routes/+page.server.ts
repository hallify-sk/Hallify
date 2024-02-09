import { SECRET_TURNSTILE_TOKEN } from '$env/static/private';
import { PUBLIC_DEV, PUBLIC_TURNSTILE_URL } from '$env/static/public';
import { fail } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

export const actions = {
	logout: async ({locals}) => {
        if(!locals.user) return fail(400);
		locals.pb.authStore.clear();
        return {success: true};
    },
	login: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get("cf-turnstile-response")?.toString();
		if(!email || email.trim() == ""){
			return fail(400, {incorrect: true, message: "Vyžaduje sa e-mail", type: "email"});
		}
		//validate email with simple regex
		if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
			return fail(400, {incorrect: true, message: "E-mail nie je platný", type: "email"});
		}
		if(!password || password.trim() == ""){
			return fail(400, {incorrect: true, message: "Vyžaduje sa heslo", type: "password"});
		}
		const formData = new FormData();
		if(PUBLIC_DEV != "true") {
            formData.append("secret", SECRET_TURNSTILE_TOKEN)
            formData.append("response", turnstile as string)
            formData.append('remoteip', getClientAddress());
            const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
                body: formData,
                method: 'POST',
            });
            const outcome = await result.json();
            if(!outcome.success) return fail(400, { incorrect: true, message: "CAPTCHA verifikácia zlyhala.", type: "auth"});
        }
		try{
			await locals.pb.collection("users").authWithPassword(email, password);
			return {success: true};
		}catch(e){
			return fail(400, {incorrect: true, message: "Nesprávna kombinácia e-mailu a hesla.", type: "auth"});
		};
	},
	register: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get("cf-turnstile-response")?.toString();

		if(!name || name.trim() == ""){
			return fail(400, {incorrect: true, message: "Vyžaduje sa meno", type: "name"});
		}
		if(!email || email.trim() == ""){
			return fail(400, {incorrect: true, message: "Vyžaduje sa e-mail", type: "email"});
		}
		//validate email with simple regex
		if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
			return fail(400, {incorrect: true, message: "E-mail nie je platný", type: "email"});
		}
		if(!password || password.trim() == ""){
			return fail(400, {incorrect: true, message: "Vyžaduje sa heslo", type: "password"});
		}
		
		//Validate password with simple regex step by step.
		if(password.length < 8){
			return fail(400, {incorrect: true, message: "Heslo musí mať aspoň 8 znakov", type: "password"});
		}
		if(!/[a-z]/.test(password)){
			return fail(400, {incorrect: true, message: "Heslo musí obsahovať aspoň jedno malé písmeno", type: "password"});
		}
		if(!/[A-Z]/.test(password)){
			return fail(400, {incorrect: true, message: "Heslo musí obsahovať aspoň jedno veľké písmeno", type: "password"});
		}
		if(!/[0-9]/.test(password)){
			return fail(400, {incorrect: true, message: "Heslo musí obsahovať aspoň jedno číslo", type: "password"});
		}

		const formData = new FormData();
		if(PUBLIC_DEV != "true") {
            formData.append("secret", SECRET_TURNSTILE_TOKEN)
            formData.append("response", turnstile as string)
            formData.append('remoteip', getClientAddress());
            const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
                body: formData,
                method: 'POST',
            });
            const outcome = await result.json();
            if(!outcome.success) return fail(400, { incorrect: true, message: "CAPTCHA verifikácia zlyhala.", type: "auth"});
        }
		try {
			const createData = new FormData();
			createData.append("name", name);
			createData.append("email", email);
			createData.append("password", password);
			createData.append("passwordConfirm", password);
			await (locals.pb as PocketBase).collection("users").create(createData);
			await locals.pb.collection("users").authWithPassword(email, password);
			return { success: true };
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			console.log((e as any).data.data);
			return fail(404, { incorrect: true, message: "E-Mail neexistuje alebo heslo je neplatné", type: "auth" });
		}
	},
};

/** @type {import('./$types').PageServerLoad} */
export async function load({locals}) {
	return {
		stages: await locals.pb.collection('stages').getFullList({ sort: 'created' })
	};
}
