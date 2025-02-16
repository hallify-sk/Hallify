import themer from 'tailwindcss-themer';
import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/layerchart/**/*.{svelte,js}'],
	theme: {
		extend: {}
	},
	darkMode: "class",
	plugins: [
		themer({
			defaultTheme: {
				extend: {
					colors: {
						primary: colors.blue[500],
						'primary-1': colors.blue[300],
						'primary-2': colors.blue[400],
						'primary-4': colors.blue[600],
						'primary-5': colors.blue[700],
						secondary: colors.violet[500],
						'secondary-1': colors.violet[300],
						'secondary-2': colors.violet[400],
						'secondary-4': colors.violet[600],
						'secondary-5': colors.violet[700],
						accent: '#f66d9b',
						black: '#000000',
						white: colors.slate[100],
						'background-main': colors.slate[200],
						'background-1': colors.slate[100],
						'background-2': colors.slate[200],
						'background-4': '#718096',
						'background-5': '#2d3748',
						'border-main': colors.slate[400],
						'text-main': colors.slate[700],
						'text-1': colors.slate[500],
						'text-2': colors.slate[600],
						'text-4': colors.slate[800],
						'text-5': colors.slate[900],
						'calendar-sunday-main': colors.red[500],
						'calendar-sunday-1': colors.red[200]
					}
				}
			},
			themes: [
				{
					name: 'darkTheme',
					selectors: ['.dark', '[data-theme="dark"]'],
					extend: {
						colors: {
							primary: colors.blue[400],
							'primary-1': colors.blue[300],
							'primary-2': colors.blue[300],
							'primary-4': colors.blue[600],
							'primary-5': colors.blue[700],
							secondary: colors.violet[500],
							'secondary-1': colors.violet[300],
							'secondary-2': colors.violet[400],
							'secondary-4': colors.violet[600],
							'secondary-5': colors.violet[700],
							accent: '#f66d9b',
							black: colors.slate[900],
							white: colors.slate[100],
							'background-main': colors.gray[800],
							'background-1': colors.gray[700],
							'background-2': colors.gray[800],
							'background-4': colors.gray[600],
							'background-5': colors.gray[500],
							'border-main': colors.gray[600],
							'text-main': colors.gray[200],
							'text-1': colors.gray[400],
							'text-2': colors.gray[300],
							'text-4': colors.gray[100],
							'text-5': colors.gray[50],
							'calendar-sunday-main': colors.red[500],
							'calendar-sunday-1': colors.red[200]
						}
					}
				},
				{
					name: 'neon',
					selectors: ['.neon'],
					extend: {
						colors: {
							primary: colors.blue[400],
							'primary-1': colors.blue[300],
							'primary-2': colors.blue[300],
							'primary-4': colors.blue[600],
							'primary-5': colors.blue[700],
							secondary: colors.violet[500],
							'secondary-1': colors.violet[300],
							'secondary-2': colors.violet[400],
							'secondary-4': colors.violet[600],
							'secondary-5': colors.violet[700],
							accent: '#f66d9b',
							black: colors.slate[900],
							white: colors.slate[100],
							'background-main': colors.gray[800],
							'background-1': colors.gray[700],
							'background-2': colors.gray[800],
							'background-4': colors.gray[600],
							'background-5': colors.gray[500],
							'border-main': colors.gray[600],
							'text-main': colors.gray[200],
							'text-1': colors.gray[400],
							'text-2': colors.gray[300],
							'text-4': colors.gray[100],
							'text-5': colors.gray[50],
							'calendar-sunday-main': colors.red[500],
							'calendar-sunday-1': colors.red[200]
						}
					}
				}
			]
		})
	],
	safelist: [
		'col-start-1',
		'col-start-2',
		'col-start-3',
		'col-start-4',
		'col-start-5',
		'col-start-6',
		'col-start-7'
	]
};
