"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportToTelegramPlugin = void 0;
const plugin_utils_1 = require("@debut/plugin-utils");
const axios_1 = __importDefault(require("axios"));
function reportToTelegramPlugin(opts) {
    const messageHistory = {};
    const curTime = new Date().getTime();
    const url = `https://api.telegram.org/bot${opts.botToken}/sendMessage`;
    return {
        name: 'report-to-telegram',
        async onOpen(order) {
            if (order.learning || order?.time < curTime) {
                return;
            }
            const data = order.orderId.split('-');
            const message = `${data[1]}\nlots:${order.lots}\nprice:${data[2]}`;
            try {
                await axios_1.default.get(url, {
                    params: {
                        chat_id: opts.chatId,
                        text: message
                    }
                })
                    .then((response) => {
                    messageHistory[order.orderId] = response?.data?.result?.message_id;
                }).catch((error) => {
                    console.error('Error sending message:', error);
                });
            }
            catch (err) {
                console.error({ err });
            }
        },
        async onClose(order, closing) {
            if (order.learning || order?.time < curTime) {
                return;
            }
            const data = order.orderId.split('-');
            const profit = plugin_utils_1.orders.getCurrencyProfit(closing, +data[2]);
            let reply_to_message_id = null;
            if (order?.openId && messageHistory[order.openId]) {
                reply_to_message_id = messageHistory[order.openId];
            }
            const message = `${data[1]}\nlots:${order.lots}\nprice:${data[2]}\nprofit: ${profit}\nbalance:${this.debut.opts.amount}`;
            try {
                await axios_1.default.get(url, {
                    params: {
                        chat_id: opts.chatId,
                        text: message,
                        reply_to_message_id
                    }
                });
            }
            catch (err) {
                console.error({ err });
            }
        },
    };
}
exports.reportToTelegramPlugin = reportToTelegramPlugin;
//# sourceMappingURL=index.js.map