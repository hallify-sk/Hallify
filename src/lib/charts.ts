export function barGraphStyle(xAxisData: string[]) {
	return {
		lineStyle: {
			color: '#FFFFFF',
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
			// Try 'horizontal'
			orient: 'horizontal',
			top: 0,
			left: 'center'
		},
		tooltip: {},
		xAxis: {
			axisTick: {
				show: false
			},
			data: xAxisData,
			splitLine: {
				show: true,
				lineStyle: {
					color: '#e2e8f0',
					type: 'dashed',
					width: 1
				}
			},
			axisLine: {
				lineStyle: {
					color: '#94a3b8',
					width: 1,
					join: 'round',
					cap: 'round'
				}
			}
		},
		yAxis: {
			splitLine: {
				lineStyle: {
					color: '#e2e8f0',
					type: 'dashed',
					width: 1
				}
			},
			minInterval: 1
		}
	};
}
