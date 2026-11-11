import { env } from 'node:process'
const BACKEND_URL = 'https://koya-clinic-booking-k12u.onrender.com'

export default async function handler(req: any, res: any) {
  const apiKey = env.API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured' })
  }

  const requestUrl = new URL(req.url, 'https://localhost')
  const endpoint = requestUrl.pathname.replace(/^\/api\/?/, '')

  const targetUrl = `${BACKEND_URL}/${endpoint}${requestUrl.search}`

  try {
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
    }

    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type']
    }

    if (req.headers['idempotency-key']) {
      headers['Idempotency-Key'] = req.headers['idempotency-key']
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : JSON.stringify(req.body),
    })

    const data = await response.text()

    const contentType = response.headers.get('content-type')
    const retryAfter = response.headers.get('retry-after')

    if (contentType) res.setHeader('Content-Type', contentType)
    if (retryAfter) res.setHeader('Retry-After', retryAfter)

    return res.status(response.status).send(data)
  } catch {
    return res.status(502).json({ error: 'Unable to reach booking API' })
  }
}
