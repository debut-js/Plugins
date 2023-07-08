import { PluginInterface } from '@debut/types';
export type ReportToTelegramOptions = {
    botToken: string;
    chatId: string;
};
export declare function reportToTelegramPlugin(opts: ReportToTelegramOptions): PluginInterface;
