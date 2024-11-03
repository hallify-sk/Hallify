import { expect, test } from '@playwright/test';

test('Should throw unauthorized', async ({ request }) => {
	const response = await request.post(`/api/halls`, {
		data: {
			title: '[Bug] report 1',
			body: 'Bug description'
		}
	});
	expect(response.status()).toEqual(401);
});
