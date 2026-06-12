import type { PageServerLoad } from './$types';
import sql from '$lib/db';
import os from 'node:os';

export const load: PageServerLoad = async () => {
	const [dbCheck] = await sql<{ ok: boolean }[]>`SELECT true AS ok`;
	const uptimeSeconds = Math.floor(process.uptime());
	const hours = Math.floor(uptimeSeconds / 3600);
	const mins = Math.floor((uptimeSeconds % 3600) / 60);

	const system = {
		version: '1.0.0',
		nodeVersion: process.version,
		platform: `${os.type()} ${os.release()}`,
		dbConnected: !!dbCheck?.ok,
		uptime: `${hours}h ${mins}m`,
		memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
	};

	return { system };
};
