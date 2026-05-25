const Anthropic = require('@anthropic-ai/sdk');

const ALLOWED_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-3-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Méthode non autorisée.' }),
    };
  }

  // Clé API obligatoire côté serveur
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY manquante dans les variables d\'environnement.');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Configuration serveur manquante. Ajoutez ANTHROPIC_API_KEY dans les variables d\'environnement Netlify.',
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Corps de requête JSON invalide.' }),
    };
  }

  const { prompt, model = 'claude-sonnet-4-5', maxTokens = 2048 } = body;

  // Validation
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Le prompt est requis et ne peut pas être vide.' }),
    };
  }

  if (prompt.length > 50000) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Prompt trop long (max 50 000 caractères).' }),
    };
  }

  const safeModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-5';
  const safeMaxTokens = Math.min(Math.max(parseInt(maxTokens, 10) || 2048, 256), 8192);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: safeModel,
      max_tokens: safeMaxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText =
      message.content[0]?.type === 'text' ? message.content[0].text : '';

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        response: responseText,
        model: message.model,
        usage: {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        },
      }),
    };
  } catch (err) {
    console.error('Erreur Anthropic API:', err);

    if (err.status === 401) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Clé API invalide ou expirée.' }),
      };
    }
    if (err.status === 429) {
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.',
        }),
      };
    }
    if (err.status === 400) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Requête invalide : ${err.message}` }),
      };
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Erreur serveur : ${err.message}` }),
    };
  }
};
