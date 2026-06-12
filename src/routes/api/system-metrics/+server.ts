import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import os from 'node:os';

// Store previous CPU measurement for delta calculation
let prevCpuUsage = process.cpuUsage();
let prevTime = Date.now();

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	// CPU usage (percentage since last call)
	const currentCpuUsage = process.cpuUsage(prevCpuUsage);
	const currentTime = Date.now();
	const elapsedMs = currentTime - prevTime;
	// cpuUsage returns microseconds; convert to ms then to percentage of elapsed wall time
	const cpuPercent = elapsedMs > 0
		? Math.min(100, Math.round(((currentCpuUsage.user + currentCpuUsage.system) / 1000) / elapsedMs * 100))
		: 0;
	prevCpuUsage = process.cpuUsage();
	prevTime = currentTime;

	// Memory
	const mem = process.memoryUsage();
	const totalMem = os.totalmem();
	const freeMem = os.freemem();

	return json({
		cpu: cpuPercent,
		memory: {
			heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
			heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
			rss: Math.round(mem.rss / 1024 / 1024),
			systemTotal: Math.round(totalMem / 1024 / 1024),
			systemFree: Math.round(freeMem / 1024 / 1024),
			systemUsed: Math.round((totalMem - freeMem) / 1024 / 1024),
		},
		timestamp: currentTime,
	});
};
