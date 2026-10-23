import { describe, expect, it } from 'vitest';
import { channelName, channelNameProblem, splitMentions, CHANNEL_NAME_MAX } from './channels';

describe('channelName', () => {
	it('keeps Slovak letters as their base letters', () => {
		expect(channelName('Všeobecné Novinky')).toBe('vseobecne-novinky');
		expect(channelName('Kaštieľ – ťahanie')).toBe('kastiel-tahanie');
	});
	it('refuses names with nothing usable and caps the length', () => {
		expect(channelNameProblem('!!! ###')).toBe('empty');
		expect(channelNameProblem('   ')).toBe('empty');
		expect(channelNameProblem('x'.repeat(150))).toBe('too_long');
		expect(channelName('a'.repeat(60)).length).toBe(CHANNEL_NAME_MAX);
		expect(channelNameProblem('Sklad')).toBeNull();
	});
});

describe('splitMentions', () => {
	const names = ['Jana Nováková', 'Jana', 'Peter'];
	it('highlights the longest matching member name', () => {
		expect(splitMentions('Ahoj @Jana Nováková, pozri', names)).toEqual([
			{ text: 'Ahoj ', mention: false },
			{ text: '@Jana Nováková', mention: true },
			{ text: ', pozri', mention: false },
		]);
	});
	it('ignores e-mail addresses and unknown names', () => {
		expect(splitMentions('mail jana@peter.sk @Nikto', names)).toEqual([{ text: 'mail jana@peter.sk @Nikto', mention: false }]);
	});
	it('does not match a name inside a longer word', () => {
		expect(splitMentions('@Peterka', names)).toEqual([{ text: '@Peterka', mention: false }]);
	});
});
