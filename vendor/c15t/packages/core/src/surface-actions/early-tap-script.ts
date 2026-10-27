export interface EarlyConsentTap {
	action: 'accept' | 'reject' | 'dismiss' | 'customize';
	at: number;
	model: string | null;
	prompt: string | null;
}

export interface EarlyConsentTapQueue {
	taps?: EarlyConsentTap[];
	stop?: () => void;
}

export const EARLY_TAPS_WINDOW_KEY = '__c15tEarlyTaps';

export const EARLY_TAP_STYLE_ID = 'c15t-early-tap';

export const EARLY_TAP_ROOT = '[data-testid="consent-banner-root"]';

export const EARLY_TAP_OPT_OUT = 'data-early-tap';

export const EARLY_CONSENT_TAP_SCRIPT = `(function(w,d,k){if(w[k])return;var q=[],s,c=d.currentScript,n=c&&c.nonce,R='${EARLY_TAP_ROOT}';function h(e){var t=e.target,b=t&&t.closest&&t.closest(R+' [data-action]'),a=b&&b.getAttribute('data-action'),r;if(!/^(accept|reject|dismiss|customize)$/.test(a)||b.getAttribute('${EARLY_TAP_OPT_OUT}')==='off')return;r=b.closest(R);if(r.getAttribute('data-model')==='iab'||d.querySelectorAll(R).length>1)return;e.stopImmediatePropagation();q.push({action:a,at:Date.now(),model:r.getAttribute('data-model'),prompt:r.getAttribute('data-prompt')});if(a!=='customize'&&!s){s=d.createElement('style');s.id='${EARLY_TAP_STYLE_ID}';if(n)s.nonce=n;s.textContent=R+',[data-testid="consent-banner-overlay"]{display:none!important}';(d.head||d.documentElement).appendChild(s)}}d.addEventListener('click',h,true);w[k]={taps:q,stop:function(){d.removeEventListener('click',h,true)}}})(window,document,'${EARLY_TAPS_WINDOW_KEY}')`;
