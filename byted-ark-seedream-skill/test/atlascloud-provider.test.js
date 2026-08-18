const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ATLAS_MODELS,
  normalizeProvider,
  normalizeAtlasSize,
  selectAtlasModel,
  buildAtlasPayload,
  callAtlasCloudApi
} = require('../scripts/generate.js');

test('normalizes Atlas provider aliases without changing the Ark default', () => {
  assert.equal(normalizeProvider(), 'ark');
  assert.equal(normalizeProvider('atlas'), 'atlascloud');
  assert.equal(normalizeProvider('atlas-cloud'), 'atlascloud');
  assert.throws(() => normalizeProvider('unknown'), /provider 参数无效/);
});

test('maps Seedream modes to the corresponding Atlas models', () => {
  assert.equal(selectAtlasModel({}), ATLAS_MODELS.generate);
  assert.equal(selectAtlasModel({ sequential: true }), ATLAS_MODELS.generateSequential);
  assert.equal(selectAtlasModel({ mode: 'image-to-image' }), ATLAS_MODELS.edit);
  assert.equal(
    selectAtlasModel({ mode: 'image-to-image', sequential: true }),
    ATLAS_MODELS.editSequential
  );
});

test('builds schema-aligned Atlas payloads', () => {
  assert.equal(normalizeAtlasSize('2K'), '2048*2048');
  assert.equal(normalizeAtlasSize('3072x3072'), '3072*3072');
  assert.throws(() => normalizeAtlasSize('1024x1024'), /不受 Seedream/);

  assert.deepEqual(buildAtlasPayload({
    prompt: 'test prompt',
    size: '2K',
    sequential: true,
    count: 3,
    response_format: 'png'
  }), {
    model: ATLAS_MODELS.generateSequential,
    prompt: 'test prompt',
    size: '2048*2048',
    output_format: 'png',
    max_images: 3
  });
});

test('submits once and polls with bounded backoff', async () => {
  const calls = [];
  const delays = [];
  const responses = [
    { statusCode: 200, body: { data: { id: 'prediction-1', status: 'processing' } } },
    { statusCode: 200, body: { data: { status: 'processing', outputs: [] } } },
    { statusCode: 200, body: { data: { status: 'completed', outputs: ['https://example.com/image.png'] } } }
  ];
  const requestImpl = async (url, options, body) => {
    calls.push({ url, method: options.method, body });
    return responses.shift();
  };

  const result = await callAtlasCloudApi({ prompt: 'test', size: '2K' }, {
    requestImpl,
    sleepImpl: async ms => delays.push(ms),
    config: {
      apiBaseUrl: 'https://api.atlascloud.ai/api/v1/model',
      apiKey: 'test-key'
    }
  });

  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(calls.filter(call => call.method === 'GET').length, 2);
  assert.deepEqual(delays, [3000]);
  assert.equal(result.response.data[0].url, 'https://example.com/image.png');
});
