/**
 * @file segment-inspector.js
 */

import {inspect as inspectTs} from 'mux.js/lib/tools/ts-inspector.js';
import {handleRollover} from 'mux.js/lib/m2ts/timestamp-rollover-stream.js';

const MAX_TS = 8589934592;

const RO_THRESH = 4294967296;

const PES_TIMESCALE = 90000;

/**
 * An object that inspects ts segment data to extract timing information for
 * more precise calculations
 *
 * @class SegmentInspector
 */
export default class SegmentInspector {
  constructor() {
    this.audioReferenceTimestamp_ = null;
    this.videoReferenceTimestamp_ = null;
  }

  /**
   * Inspects the given segment byte array and returns an object with timing
   * information for the first and last packet.
   */
  inspect(segment) {
    let segmentInfo = inspectTs(segment);
    this.adjustTimestamp_(segmentInfo);
    return segmentInfo;
  }

  /**
   * Adjusts the timestamp information for the segment to account for
   * rollover and convert to seconds based on pes packet timescale (90khz clock)
   */
  adjustTimestamp_(segmentInfo) {

    if (segmentInfo.audio) {
      if (this.audioReferenceTimestamp_ === null) {
        this.audioReferenceTimestamp_ = segmentInfo.audio[0].dts;
      }

      let maxDts = this.audioReferenceTimestamp_;

      segmentInfo.audio.forEach((segment) => {
        segment.pts = handleRollover(segment.pts, this.audioReferenceTimestamp_);
        segment.dts = handleRollover(segment.dts, this.audioReferenceTimestamp_);
        maxDts = Math.max(maxDts, segment.dts);
        segment.pts /= PES_TIMESCALE;
        segment.dts /= PES_TIMESCALE;
      });

      this.audioReferenceTimestamp_ = maxDts;
    }

    if (segmentInfo.video) {
      if (this.videoReferenceTimestamp_ === null) {
        this.videoReferenceTimestamp_ = segmentInfo.video[0].dts;
      }

      let maxDts = this.videoReferenceTimestamp_;

      segmentInfo.video.forEach((segment) => {
        segment.pts = handleRollover(segment.pts, this.videoReferenceTimestamp_);
        segment.dts = handleRollover(segment.dts, this.videoReferenceTimestamp_);
        maxDts = Math.max(maxDts, segment.dts);
        segment.pts /= PES_TIMESCALE;
        segment.dts /= PES_TIMESCALE;
      });

      this.videoReferenceTimestamp_ = maxDts;
    }
  }

  dispose() {
    this.audioReferenceTimestamp_ = null;
    this.videoReferenceTimestamp_ = null;
  }
}
