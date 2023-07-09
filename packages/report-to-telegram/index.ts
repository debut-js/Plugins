import { PluginInterface } from '@debut/types';
import { orders } from '@debut/plugin-utils';

import  axios from 'axios';

export type ReportToTelegramOptions = {
    botToken: string;
    chatId: string;
};

type History = Record<string, string>;

export function reportToTelegramPlugin(opts: ReportToTelegramOptions): PluginInterface {
    const messageHistory:History = {}
    const curTime = new Date().getTime()

    const url = `https://api.telegram.org/bot${opts.botToken}/sendMessage`;

    return {
        name: 'report-to-telegram',
        async onOpen(order) {
            if (order.learning || order?.time < curTime) {
                return;
            }

            const data = order.orderId.split('-')
            const message = `${data[1]}\nlots:${order.lots}\nprice:${data[2]}\nticker:${this.debut.opts.ticker}`

            try {
                await axios.get(url, {
                    params: {            
                        chat_id: opts.chatId,        
                        text: message
                    }
                })
                .then((response:any) => {
                    messageHistory[order.orderId] = response?.data?.result?.message_id
                }).catch((error:any) => {
                    console.error('Error sending message:', error);
                });  
            } catch (err){
                console.error({err})
            }
        },
        async onClose(order, closing) {
            if (order.learning || order?.time < curTime) {
                return;
            }

            const data = order.orderId.split('-')

            const profit = orders.getCurrencyProfit(closing, +data[2]);
            let reply_to_message_id = null
            if (order?.openId && messageHistory[order.openId]) {
                reply_to_message_id = messageHistory[order.openId]
            }
            const message = `${data[1]}\nlots:${order.lots}\nprice:${data[2]}\nprofit: ${profit}\nbalance:${this.debut.opts.amount}`

            try {
                await axios.get(url, {
                    params: {            
                        chat_id: opts.chatId,        
                        text: message,
                        reply_to_message_id
                    }
                })
            } catch (err){
                console.error({err})
            }
        },
    };
}
