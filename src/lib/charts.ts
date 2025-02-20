import colors from "tailwindcss/colors";

export function barGraphStyle(xAxisData: string[], theme: "light" | "dark" = "light") {
	return {
		lineStyle: {
			type: 'dashed',
			width: 2
		},
		grid: {
			left: '50px',
			right: '50px',
			top: '10%',
			bottom: '10%'
		},
		legend: {
			orient: 'horizontal',
			top: 0,
			left: 'center',
			textStyle: {
				color: theme == "light" ? colors.slate[700] : colors.gray[200]
			}
		},
		tooltip: {},
		xAxis: {
			axisTick: {
				show: false,
			},
			data: xAxisData,
			splitLine: {
				show: true,
				lineStyle: {
					color: theme == "light" ? colors.slate[300] : colors.slate[400],
					type: 'dashed',
					width: 1,
				}
			},
			axisLine: {
				lineStyle: {
					color: theme == "light" ? colors.slate[500] : colors.slate[300],
					width: 1,
					join: 'round',
					cap: 'round'
				},
			}
		},
		yAxis: {
			splitLine: {
				lineStyle: {
					color: theme == "light" ? colors.slate[300] : colors.slate[500],
					type: 'dashed',
					width: 1
				}
			},
			minInterval: 1
		}
	};
}
