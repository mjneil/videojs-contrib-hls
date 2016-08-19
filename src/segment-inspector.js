/**
 * @file segment-inspector.js
 */

import {TransportPacketStream, TransportParseStream, ElementaryStream, TimestampRolloverStream} from 'mux.js/lib/m2ts';
import StreamTypes from 'mux.js/lib/m2ts/stream-types.js';

const PES_TIMESCALE = 90000;

/**
 * An object that inspects ts segment data to extract timing information for
 * more precise calculations
 *
 * @class SegmentInspector
 */
export default class SegmentInspector {
  constructor() {
    this.transportPacketStream = new TransportPacketStream();
    this.transportParseStream = new TransportParseStream();
    this.elementaryStream = new ElementaryStream();
    this.audioTimestampRolloverStream = new TimestampRolloverStream('audio');
    this.videoTimestampRolloverStream = new TimestampRolloverStream('video');
  }

  /**
   * Inspects the given segment byte array and returns an object with timing
   * information for the first and last packet.
   */
  inspect(segment) {
    var tsPackets = [];
    var segmentInfo;

    this.transportPacketStream
      .pipe(this.transportParseStream);

    this.transportParseStream.on('data', function(event) {
      tsPackets.push(event);
    });

    this.transportParseStream.on('done', () => {
      segmentInfo = this.parsePackets_(tsPackets);
    });

    this.transportPacketStream.push(segment);
    this.transportPacketStream.flush();

    if (segmentInfo === undefined) {
      throw "ERROROROROROR";
    }

    this.adjustTimestamp_(segmentInfo);

    this.dispose();
    return segmentInfo;
  }

  /**
   * Parse the given pes packets to gain information from the first and last complete packet
   */
  parsePackets_(packets) {
    var segmentInfo = {
      video: [],
      audio: []
    };

    var processData = true;
    var first = true;

    this.elementaryStream.on('data', function(data) {
      if (processData) {
        if (data.type === 'audio') {
          if ((first && segmentInfo.audio.length === 0) ||
              (!first && segmentInfo.audio.length === 1)) {
            segmentInfo.audio.push(data);
          }
        }
        if (data.type === 'video') {
          if ((first && segmentInfo.video.length === 0) ||
              (!first && segmentInfo.video.length === 1)) {
            segmentInfo.video.push(data);
          }
        }
        if (first &&
            segmentInfo.audio.length === 1 &&
            segmentInfo.video.length === 1) {
          processData = false;
        } else if (!first &&
                    segmentInfo.audio.length === 2 &&
                    segmentInfo.video.length === 2) {
          processData = false;
        }
      }
    });

    let i = 0;
    let packet;

    while(processData && i < packets.length) {
      packet = packets[i];
      this.elementaryStream.push(packet);
      i++;
    }

    this.elementaryStream.flush();

    processData = true;
    first = false;

    i = packets.length - 1;

    let startIndex, endIndex;
    endIndex = packets.length;

    let lastPes = {
      audio: {
        done: false,
        data: []
      },
      video: {
        done: false,
        data: []
      }
    };

    // Walk back from the end to find the last video and audio pes packets
    while(i > -1) {
      packet = packets[i];
      let streamType;

      switch (packet.streamType) {
        case StreamTypes.H264_STREAM_TYPE:
          streamType = 'video';
          break;
        case StreamTypes.ADTS_STREAM_TYPE:
          streamType = 'audio';
          break;
        default:
          i--;
          continue;
      }
      if (!lastPes[streamType].done) {
        lastPes[streamType].data.unshift(packet);

        if (packet.payloadUnitStartIndicator) {
          lastPes[streamType].done = true;
        }
      }

      if (lastPes.audio.done && lastPes.video.done) {
        break;
      }

      i--;
    }

    lastPes.audio.data.forEach((packet) => {
      this.elementaryStream.push(packet);
    });
    lastPes.video.data.forEach((packet) => {
      this.elementaryStream.push(packet);
    });
    this.elementaryStream.flush();

    return segmentInfo;
  }

  /**
   * Adjusts the timestamp information for the segment to account for
   * rollover and convert to seconds based on pes packet timescale (90khz clock)
   */
  adjustTimestamp_(segmentInfo) {
    var i = 0;

    this.audioTimestampRolloverStream.on('data', function(data) {
      segmentInfo.audio[i].pts = data.pts / PES_TIMESCALE;
      segmentInfo.audio[i].dts = data.dts / PES_TIMESCALE;
    });

    this.videoTimestampRolloverStream.on('data', function(data) {
      segmentInfo.video[i].pts = data.pts / PES_TIMESCALE;
      segmentInfo.video[i].dts = data.dts / PES_TIMESCALE;
    });

    this.audioTimestampRolloverStream.push(segmentInfo.audio[i]);
    this.videoTimestampRolloverStream.push(segmentInfo.video[i]);

    i = 1;

    this.audioTimestampRolloverStream.push(segmentInfo.audio[i]);
    this.videoTimestampRolloverStream.push(segmentInfo.video[i]);

    this.audioTimestampRolloverStream.flush();
    this.videoTimestampRolloverStream.flush();
  }

  dispose() {
    this.transportPacketStream.dispose();
    this.transportParseStream.dispose();
    this.elementaryStream.dispose();
    this.audioTimestampRolloverStream.dispose();
    this.videoTimestampRolloverStream.dispose();
  }
}
