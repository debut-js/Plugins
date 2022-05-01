export default {
    name: 'Balance',
    mixins: [window.TradingVueLib.Overlay],
    methods: {
        meta_info() {
            return {
                author: 'businessduck',
                version: '0.0.1',
                desc: 'Balance overlay',
            };
        },
        draw(ctx) {
            let layout = this.$props.layout;
            ctx.strokeStyle = 'black';

            for (let i = 1; i < this.$props.data.length; i++) {
                const p1 = this.$props.data[i - 1];
                const p2 = this.$props.data[i];

                const x0 = layout.t2screen(p1[0]);
                const y0 = layout.$2screen(p1[1]);

                const x1 = layout.t2screen(p2[0]);
                const y1 = layout.$2screen(p2[1]);

                this.draw_balance(ctx, x0, y0, x1, y1);
            }
        },

        draw_balance(ctx, x0, y0, x1, y1) {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'green';
            ctx.stroke();
        },
        use_for() {
            return ['Balance'];
        },
    },
};
