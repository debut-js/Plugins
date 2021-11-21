import { Candle } from '@debut/types';
import { math } from '@debut/plugin-utils';
import { NeuroVision } from './index';

/**
 * Special candle format with ratio instead value
 */
export interface RatioCandle {
    time: number;
    volume: number;
    ratio: number;
}

/**
 * Ratio to count same ratio's distribution
 */
export interface DistributionSegment {
    ratioFrom: number;
    ratioTo: number;
    count: number;
    classify: NeuroVision;
}

/**
 * Ratio to count same ratio's distribution
 */
interface DistributionData {
    count: number;
    ratio: number;
}

/**
 * Replace close prices to ratio (percent increment) prices with prev price and current
 */
export function getQuoteRatioData(current: Candle, prev: Candle): RatioCandle {
    return {
        time: current.time,
        ratio: current.c / prev.c,
        volume: current.v,
    };
}

/**
 * Create gausiian distribution of percent increment ratio's
 * Split distribution data to same equal (in counts) segments in rages of ratios
 */
export function getDistribution(ratioCandles: RatioCandle[], segmentsCount = 6, precision = 4) {
    const map: Map<number, number> = new Map();

    for (let i = 0; i < ratioCandles.length; i++) {
        const candle = ratioCandles[i];
        const key = math.toFixed(candle.ratio, precision);
        const counter = map.get(key) || 0;

        map.set(key, counter + 1);
    }

    const sortedRatioKeys = Array.from(map.keys()).sort();
    const gaussianDistr: DistributionData[] = [];

    sortedRatioKeys.forEach((key) => {
        gaussianDistr.push({
            count: map.get(key) || 0,
            ratio: key,
        });
    });

    const segments: DistributionSegment[] = [];
    const segmentSize = Math.ceil(ratioCandles.length / segmentsCount);
    let localCountSum = 0;
    let ratioFrom = gaussianDistr[0].ratio;

    gaussianDistr.forEach((item, idx) => {
        const isLast = idx === gaussianDistr.length - 1;
        const isFilled = segments.length === segmentsCount - 1;
        const nextSum = localCountSum + item.count;

        if ((nextSum > segmentSize && !isFilled) || isLast) {
            const index = segments.length;

            segments.push({
                ratioFrom,
                ratioTo: item.ratio,
                count: localCountSum,
                classify: getGroup(index, segmentsCount),
            });
            localCountSum = item.count;
            ratioFrom = item.ratio;
        } else {
            localCountSum = nextSum;
        }
    });

    return segments;
}

function getGroup(idx: number, total: number): NeuroVision {
    // 5 statements in enum NeuroVision
    const visionStep = total / 5;

    if (idx < visionStep) {
        return NeuroVision.HIGH_DOWNTREND;
    }

    if (idx < visionStep * 2) {
        return NeuroVision.LOW_DOWNTREND;
    }

    if (idx < visionStep * 3) {
        return NeuroVision.NEUTRAL;
    }

    if (idx < visionStep * 4) {
        return NeuroVision.LOW_UPTREND;
    }

    return NeuroVision.HIGH_UPTREND;
}
