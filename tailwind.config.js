import themer from 'tailwindcss-themer';
import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/layerchart/**/*.{svelte,js}'],
	theme: {
		extend: {}
	},
	darkMode: 'class',
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
						secondary: colors.pink[500],
						'secondary-1': colors.pink[300],
						'secondary-2': colors.pink[400],
						'secondary-4': colors.pink[600],
						'secondary-5': colors.pink[700],
						accent: '#f66d9b',
						black: '#000000',
						white: colors.slate[100],
						'background-main': colors.slate[200],
						'background-1': colors.slate[100],
						'background-2': colors.slate[200],
						'background-4': colors.slate[200],
						'background-5': colors.slate[100],
						'border-main': colors.slate[400],
						'text-main': colors.slate[700],
						'text-1': colors.slate[500],
						'text-2': colors.slate[600],
						'text-4': colors.slate[800],
						'text-5': colors.slate[900],
						'calendar-sunday-main': colors.red[500],
						'calendar-sunday-1': colors.red[300],
						warning: colors.yellow[500],
						'warning-1': colors.yellow[300],
						'warning-2': colors.yellow[400],
						'warning-4': colors.yellow[600],
						'warning-5': colors.yellow[700],
						danger: colors.red[500],
						'danger-1': colors.red[300],
						'danger-2': colors.red[400],
						'danger-4': colors.red[600],
						'danger-5': colors.red[700],
						success: colors.green[500],
						'success-1': colors.green[300],
						'success-2': colors.green[400],
						'success-4': colors.green[600],
						'success-5': colors.green[700]
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
							'primary-1': colors.blue[200],
							'primary-2': colors.blue[300],
							'primary-4': colors.blue[500],
							'primary-5': colors.blue[600],
							secondary: colors.pink[400],
							'secondary-1': colors.pink[200],
							'secondary-2': colors.pink[300],
							'secondary-4': colors.pink[500],
							'secondary-5': colors.pink[600],
							accent: '#f66d9b',
							black: colors.slate[900],
							white: colors.slate[100],
							'background-main': colors.gray[800],
							'background-1': colors.gray[700],
							'background-2': colors.gray[800],
							'background-4': colors.gray[600],
							'background-5': colors.gray[500],
							'border-main': colors.gray[500],
							'text-main': colors.gray[200],
							'text-1': colors.gray[400],
							'text-2': colors.gray[300],
							'text-4': colors.gray[100],
							'text-5': colors.gray[50],
							'calendar-sunday-main': colors.red[400],
							'calendar-sunday-1': colors.red[300],
							warning: colors.yellow[400],
							'warning-1': colors.yellow[200],
							'warning-2': colors.yellow[300],
							'warning-4': colors.yellow[500],
							'warning-5': colors.yellow[600],
							danger: colors.red[400],
							'danger-1': colors.red[200],
							'danger-2': colors.red[300],
							'danger-4': colors.red[500],
							'danger-5': colors.red[600],
							success: colors.green[400],
							'success-1': colors.green[200],
							'success-2': colors.green[300],
							'success-4': colors.green[500],
							'success-5': colors.green[600]
						}
					}
				},
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
