const CROSS = `m512.001 84.853-84.853-84.853-171.147 171.147-171.148-171.147-84.853
        84.853 171.148 171.147-171.148 171.148 84.853 84.853 171.148-171.147
        171.147 171.147 84.853-84.853-171.148-171.148z`;

export default {
    name: 'Orders',
    mixins: [window.TradingVueLib.Overlay],
    methods: {
        meta_info() {
            return {
                author: 'businessduck',
                version: '0.0.1',
                desc: 'Trades overlay with arrows',
            };
        },
        draw(ctx) {
            let layout = this.$props.layout;
            ctx.strokeStyle = 'black';

            for (var deal of this.$props.data) {
                ctx.fillStyle = deal[1] ? this.buy_color : this.sell_color;
                const x0 = layout.t2screen(deal[0]);
                const y0 = layout.$2screen(deal[2]);
                const x1 = layout.t2screen(deal[4]);
                const y1 = layout.$2screen(deal[6]);

                if (x0 === x1 && y0 === y1) {
                    this.draw_entry(ctx, x0, y0, deal);
                } else {
                    this.draw_background(ctx, x0, y0, x1, y1, deal);
                    this.draw_arrow(ctx, x0, y0, x1, y1, 1);
                }
            }
        },
        draw_background(ctx, x1, y1, x2, y2, deal) {
            ctx.save();
            ctx.fillStyle = 'rgb(10, 153, 129, 0.5)';

            if (deal[7] === 'Stop') {
                ctx.fillStyle = 'rgb(242, 53, 69, 0.5)';
            }

            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            ctx.restore();
        },
        draw_entry(ctx, x, y, p) {
            ctx.save();
            ctx.beginPath();
            const startX = x - 48;
            const startY = y - 18;

            ctx.moveTo(startX, startY + 24);
            ctx.lineTo(startX + 36, startY + 24);
            ctx.lineTo(startX + 48, startY + 18);
            ctx.lineTo(startX + 36, startY + 12);
            ctx.lineTo(startX + 0, startY + 12);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillText(p[3], startX + 6, startY + 21.5);
            ctx.restore();
        },
        draw_cross(ctx, x, y) {
            ctx.save();
            let p = new Path2D(CROSS);
            ctx.lineWidth = 150;
            ctx.translate(x - 5, y - 5);
            ctx.scale(0.0175, 0.0175);
            ctx.stroke(p);
            ctx.fill(p);
            ctx.scale(1, 1);
            ctx.restore();
        },
        draw_info(ctx, x, y, width, height, deal) {
            const radius = 3;
            ctx.save();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#000000';
            ctx.fillStyle = '#abc';
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#000000';
            const text = `Entry: ${deal[2]} / Exit: ${deal[6]}`;
            ctx.fillText(text, x + width / 2, y + height / 2);
            ctx.restore();
        },
        draw_arrow(ctx, fromx, fromy, tox, toy, arrowWidth) {
            //variables to be used when creating the arrow
            var headlen = 10;
            var angle = Math.atan2(toy - fromy, tox - fromx);

            ctx.save();
            ctx.strokeStyle = 'rgb(255, 255, 255, 0.7)';
            ctx.setLineDash([10, 5]);

            //starting path of the arrow from the start square to the end square
            //and drawing the stroke
            ctx.beginPath();
            ctx.moveTo(fromx, fromy);
            ctx.lineTo(tox, toy);
            ctx.lineWidth = arrowWidth;
            ctx.stroke();

            //starting a new path from the head of the arrow to one of the sides of
            //the point
            ctx.beginPath();
            ctx.moveTo(tox, toy);
            ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 7), toy - headlen * Math.sin(angle - Math.PI / 7));

            //path from the side point of the arrow, to the other side point
            ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 7), toy - headlen * Math.sin(angle + Math.PI / 7));

            ctx.setLineDash([0, 0]);
            //path from the side point back to the tip of the arrow, and then
            //again to the opposite side point
            ctx.lineTo(tox, toy);
            ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 7), toy - headlen * Math.sin(angle - Math.PI / 7));

            //draws the paths created above
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        use_for() {
            return ['Orders'];
        },
        // Defines legend format (values & colors)
        legend(values) {
            switch (values[1]) {
                case 0:
                    var pos = 'Sell';
                    break;
                case 1:
                    pos = 'Buy';
                    break;
                default:
                    pos = 'Unknown';
            }
            return [
                {
                    value: pos.toLocaleUpperCase(),
                },
                {
                    value: values[2].toFixed(4),
                    color: this.$props.colors.colorText,
                },
                {
                    value: '→',
                },
                {
                    value: values[6].toFixed(4),
                    color: this.$props.colors.colorText,
                },
            ];
        },
    },
    // Define internal setting & constants here
    computed: {
        sett() {
            return this.$props.settings;
        },
        default_font() {
            return '12px ' + this.$props.font.split('px').pop();
        },
        buy_color() {
            return this.sett.buyColor || 'rgb(37, 177, 247, 0.65)';
        },
        sell_color() {
            return this.sett.sellColor || 'rgb(255, 92, 92, 0.65)';
        },
        label_color() {
            return this.sett.labelColor || this.colors.text;
        },
        marker_size() {
            return this.sett.markerSize || 5;
        },
        show_label() {
            return this.sett.showLabel !== false;
        },
        new_font() {
            return this.sett.font || this.default_font;
        },
    },
};
