
import { XMWriter } from '../src/xmWriter';
import { XMModule, XMPattern } from '../src/types';

describe('XMWriter Bug Reproduction: Empty Note Fallback', () => {
  it('should write a truly empty note (1 byte) when pattern data is missing', () => {
    // 1. Create a minimal module structure
    const module: XMModule = {
      header: {
        moduleName: 'Test',
        trackerName: 'Test',
        version: 0x0104,
        songLength: 1,
        restartPosition: 0,
        numberOfChannels: 1, // Only 1 channel to keep it simple
        numberOfPatterns: 1,
        numberOfInstruments: 0,
        flags: 1,
        defaultTempo: 6,
        defaultBPM: 125,
        patternOrderTable: new Array(256).fill(0),
      },
      patterns: [],
      instruments: [],
    };

    // 2. Create a sparse pattern.
    // We define a pattern with 1 row and 1 channel, but we LEAVE THE DATA EMPTY.
    // This forces XMWriter to use the fallback object: `pattern.data[0]?.[0] || { ... }`
    const pattern: XMPattern = {
      header: {
        headerLength: 9,
        packingType: 0,
        numberOfRows: 1,
        packedDataSize: 0,
      },
      data: [], // Sparse/Empty data
    };
    module.patterns.push(pattern);

    // 3. Write the module
    const writer = new XMWriter();
    const buffer = writer.write(module);
    const view = new DataView(buffer);

    // 4. Locate the pattern data
    // Header is 276 bytes + header size uint32 (4 bytes).
    // Let's rely on finding the pattern header structure to be safe, or calculate offsets.
    //
    // File structure:
    // XM Header: 60 + 276 = 336 bytes.
    // Pattern 1 Header:
    //   Length (4 bytes)
    //   Packing (1 byte)
    //   Rows (2 bytes)
    //   PackedSize (2 bytes)
    //   -> Total 9 bytes
    //
    // The Packed Data follows immediately after the 9-byte pattern header.

    const xmHeaderSize = 60 + 276;
    const patternHeaderStart = xmHeaderSize;
    const packedDataStart = patternHeaderStart + 9;

    // 5. Inspect the first byte of the packed data
    // Expected (Correct): 0x80 (1 byte total for the row)
    // Current (Buggy):    0x84 0x10 (2 bytes total)

    // Check what we actually have
    const firstByte = view.getUint8(packedDataStart);

    // If the bug exists, we might see 0x84 (bit 7 set + bit 2 for volume)
    // If fixed, we see 0x80 (only bit 7 set)

    // We also want to check the packed data size written in the pattern header.
    // Packed size is at offset patternHeaderStart + 7 (uint16)
    const packedSize = view.getUint16(patternHeaderStart + 7, true); // Little endian

    // Expectation for a single empty row on 1 channel:
    // The Writer writes 1 byte: 0x80.
    // So packedSize should be 1.

    if (packedSize !== 1) {
       console.log(`Failed! Packed size is ${packedSize}. Data bytes:`);
       for(let i=0; i<packedSize; i++) {
         console.log(`Byte ${i}: 0x${view.getUint8(packedDataStart + i).toString(16)}`);
       }
    }

    expect(packedSize).toBe(1);
    expect(firstByte).toBe(0x80);
  });
});
