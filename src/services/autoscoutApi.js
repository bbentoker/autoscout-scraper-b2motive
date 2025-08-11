const axios = require('axios');
const cheerio = require('cheerio');

function resolveCultureIsoFromUrl(url) {
  if (!url) return 'fr-BE';
  try {
    if (url.includes('/fr/')) return 'fr-BE';
    if (url.includes('/nl/')) return 'nl-BE';
    if (url.includes('/de/')) return 'de-BE';
    return 'fr-BE';
  } catch {
    return 'fr-BE';
  }
}

async function getVisitorCookie() {
  try {
    const res = await axios.get('https://www.autoscout24.be/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-BE,fr;q=0.9,en;q=0.8'
      }
    });
    const setCookie = res.headers['set-cookie'] || [];
    const cookie = setCookie.find((c) => c.startsWith('as24Visitor='));
    if (!cookie) return null;
    const value = cookie.split(';')[0];
    return value;
  } catch (e) {
    console.warn('⚠️ Could not fetch as24Visitor cookie:', e.message);
    return null;
  }
}

function extractCustomerIdFromHtml(html) {
  try {
    const $ = cheerio.load(html);
    const candidateImgs = [
      'div.dp-header__bar a.dp-header__logo img',
      'div.dp-header__bar img',
      'header img',
      'img'
    ];
    let src = null;
    for (const sel of candidateImgs) {
      const img = $(sel).first();
      if (img && img.attr('src')) {
        src = img.attr('src');
        if (src.includes('/dealer-info/')) break;
      }
    }
    if (!src) {
      const regex = /https?:\/\/[^\s"']*dealer-info\/\d+[^\s"']*/i;
      const m = html.match(regex);
      if (m) src = m[0];
    }
    if (!src) return null;
    const idMatch = src.match(/dealer-info\/(\d+)/i);
    if (idMatch) return parseInt(idMatch[1], 10);
    const idMatch2 = src.match(/dealer-info\/(\d+)-original/i);
    if (idMatch2) return parseInt(idMatch2[1], 10);
    return null;
  } catch (e) {
    console.error('❌ Failed to extract customerId:', e.message);
    return null;
  }
}

function extractMakeOptionsFromHtml(html) {
  const $ = cheerio.load(html);
  const options = [];
  $('select[data-testid="brand-select"] option').each((_, el) => {
    const value = $(el).attr('value');
    const label = $(el).attr('data-label') || $(el).text();
    const idNum = parseInt(value, 10);
    if (!Number.isNaN(idNum) && idNum > 0) {
      options.push({ id: idNum, label: (label || '').trim() });
    }
  });
  if (options.length === 0) {
    $('div.dp-filter-section.dp-brand-model select option').each((_, el) => {
      const value = $(el).attr('value');
      const label = $(el).attr('data-label') || $(el).text();
      const idNum = parseInt(value, 10);
      if (!Number.isNaN(idNum) && idNum > 0) {
        options.push({ id: idNum, label: (label || '').trim() });
      }
    });
  }
  return options;
}

async function fetchDealerListings({ customerId, page, cultureIso, referer, visitorCookie, sortBy = 'age', desc = true, makeId = -1 }) {
  const url = 'https://www.autoscout24.be/api/dealer-detail/fetch-listings';
  const payload = {
    cultureIso: cultureIso || 'fr-BE',
    customerId: customerId,
    userType: null,
    filters: {
      makeId: makeId != null ? makeId : -1,
      modelId: -1,
      vehicleType: 'C',
      mileageFrom: '-1',
      mileageTo: '-1',
      priceFrom: '-1',
      priceTo: '-1',
      yearOfRegistrationFrom: '-1',
      yearOfRegistrationTo: '-1',
      numberOfAxles: '-1',
      variant: '',
      bodyTypes: []
    },
    sorting: {
      sortBy: sortBy,
      desc: !!desc,
      recommendedSortingBasedId: '-1'
    },
    ...(page != null ? { page } : {}),
    togglesString: ''
  };

  const headers = {
    accept: '*/*',
    'content-type': 'application/json',
    origin: 'https://www.autoscout24.be',
    referer: referer || 'https://www.autoscout24.be/',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept-language': cultureIso?.toLowerCase().startsWith('nl') ? 'nl-BE' : 'fr-BE',
    'x-toguru': ''
  };
  if (visitorCookie) headers['cookie'] = visitorCookie;

  const res = await axios.post(url, payload, { headers });
  return res.data;
}

module.exports = {
  resolveCultureIsoFromUrl,
  getVisitorCookie,
  extractCustomerIdFromHtml,
  extractMakeOptionsFromHtml,
  fetchDealerListings,
};


