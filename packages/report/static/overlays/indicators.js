const colors = [
    '#7B8BA3',
    '#9E7CC8',
    '#88A5BA',
    '#99CDED',
    '#D3D8E0',
    '#CEBDE3',
    '#0082D1',
    '#3C7D9A',
    '#66B4E3',
    '#D2DBE3',
];

function makeRandomColor() {
    var c = '';
    while (c.length < 7) {
        c += Math.random().toString(16).substr(-6).substr(-1);
    }
    return '#' + c;
}

function getLineColor(i) {
    if (i >= colors.length) {
        return makeRandomColor();
    }

    return colors[i];
}

export default {
    name: 'Debut Indicators',
    mixins: [window.TradingVueLib.Overlay],
    methods: {
        meta_info() {
            return {
                author: 'businessduck',
                version: '0.0.1',
                desc: 'Debut single indicator drawings',
                preset: {
                    name: '$title',
                    side: '$side',
                    settings: {
                        lineWidth: 0.75,
                        color: '#e28a3dee',
                        backColor: '#e28a3d11',
                        bandColor: '#aaaaaa',
                        upper: 100,
                        lower: -100,
                    },
                },
            };
        },

        // Drawings the indicators
        draw(ctx) {
            const layout = this.$props.layout;

            for (let i = 1; i < this.$props.data.length; i++) {
                const p1 = this.$props.data[i - 1];
                const p2 = this.$props.data[i];
                const x1 = layout.t2screen(p1[0]);
                const x2 = layout.t2screen(p2[0]);

                // Skip 0 its timeframe
                for (let j = 1; j < this.$props.settings.schema.length; j++) {
                    const schema = this.$props.settings.schema[j].split('.');
                    const type = schema.pop();
                    const name = schema.shift();
                    let modifier = 'line';

                    if (schema.length === 1) {
                        modifier = schema.pop();
                    }

                    const y1 = layout.$2screen(p1[j]);
                    const y2 = layout.$2screen(p2[j]);

                    if (type === 'value') {
                        if (modifier === 'line') {
                            const color = getLineColor(j - 1);
                            this.drawLine(ctx, [x1, y1], [x2, y2], color);
                        } else if (modifier === 'bar') {
                            this.drawHistogram(ctx, x2, y2);
                        }
                    }
                }
            }
        },
        use_for() {
            return ['Indicators'];
        },
        legend(values) {
            const legend = [];

            for (let j = 1; j < this.$props.settings.schema.length; j++) {
                const schema = this.$props.settings.schema[j].split('.');
                const type = schema.pop();

                if (type === 'value') {
                    const name = schema.shift();

                    legend.push({ value: name });
                    legend.push({ value: parseFloat(values[j]).toFixed(3) });
                }
            }

            return legend;
        },

        drawLine(ctx, begin, end, stroke = 'black', width = 2) {
            if (stroke) {
                ctx.strokeStyle = stroke;
            }

            if (width) {
                ctx.lineWidth = width;
            }

            ctx.beginPath();
            ctx.moveTo(...begin);
            ctx.lineTo(...end);
            ctx.stroke();
        },
        drawHistogram(ctx, x, y, color = '#2966bc') {
            const layout = this.$props.layout;
            const width = 8;
            const lineWidth = 8;
            const base = layout.$2screen(0) + 0.5;
            const off = width % 2;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = 'blue';
            ctx.beginPath();

            x = x - off;
            y = y - 0.5;

            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, base);
            ctx.lineTo(x, y);
            ctx.stroke();
        },
    },
    // Define internal setting & constants here
    computed: {
        sett() {
            return this.$props.settings;
        },
    },
};
