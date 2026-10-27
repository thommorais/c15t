import { writePolicyResolutionWire } from '@c15t/schema/types';

import type { Script } from '../libs/script-loader/types';
import {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
} from '../modules/has';
import { resolveStorageKeys } from '../modules/persistence/record-storage';
import {
	CATEGORY_CODES,
	IAB_CODES,
	SUBJECT_CODES,
} from '../modules/persistence/writer/encode';
import type { ConsentSnapshot } from '../types';
import { storageFor } from './assemble';
import { createRuntimeKernel } from './runtime-kernel';
import type { ConsentRuntimeOptions, RuntimePrefetch } from './types';

type ServerScriptOptions = ConsentRuntimeOptions & {
	prefetch?: RuntimePrefetch;
};

interface ServerRunnable {
	scripts: { hasConsent: boolean; script: Script }[];
	snapshot?: ConsentSnapshot;
}

const serverRunnableScripts = function serverRunnableScripts(
	options: ServerScriptOptions,
	scripts: Script[]
): ServerRunnable {
	const { prefetch } = options;
	if (
		scripts.length === 0 ||
		options.consentSource ||
		(typeof options.persistence === 'object' &&
			options.persistence.skipHydration === false) ||
		!prefetch?.initialPolicyResolution ||
		prefetch.now === undefined
	) {
		return { scripts: [] };
	}
	let kernel: ReturnType<typeof createRuntimeKernel> | undefined;
	try {
		const resolution = prefetch.initialPolicyResolution;
		kernel = createRuntimeKernel(
			Object.assign(Object.create(options) as ConsentRuntimeOptions, {
				mode: (() => ({
					init: () =>
						Promise.resolve({
							policyResolution: writePolicyResolutionWire(resolution),
						}),
				})) as unknown as ConsentRuntimeOptions['mode'],
				prefetch,
			})
		);
		const snapshot = kernel.getSnapshot();
		const now = Date.now();
		return {
			scripts: scripts.flatMap((script) => {
				const hasConsent = evaluateConsent(script, snapshot, now);
				return script.alwaysLoad === true || hasConsent
					? [{ hasConsent, script }]
					: [];
			}),
			snapshot,
		};
	} catch {
		return { scripts: [] };
	} finally {
		kernel?.dispose();
	}
};

const inlineJSON = function inlineJSON(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</gu, '\\u003c')
		.replace(/\u2028/gu, '\\u2028')
		.replace(/\u2029/gu, '\\u2029');
};

const PRIORITY_IMAGE_WAIT_MS = 3000;

const AFTER_PRIORITY_IMAGES = `function(f){var h=[].filter.call(document.querySelectorAll('img[fetchpriority=high]'),function(x){return!x.complete}),l=h.length,d=function(){if(f){var g=f;f=null;g()}};if(!l)return d();setTimeout(d,${PRIORITY_IMAGE_WAIT_MS});h.forEach(function(x){var c=function(){if(!--l)d()};x.addEventListener('load',c);x.addEventListener('error',c)})}`;

const INSERT_SCRIPT = `function(id,src,o){var e=document.createElement('script');e.src=src;e.__c15tConsent=o.consent;e.__c15tScript=o.script;if(o.async!=null)e.async=o.async;if(o.defer)e.defer=true;if(o.fetchPriority)e.fetchPriority=o.fetchPriority;if(o.nonce||n)e.nonce=o.nonce||n;for(var k in o.attributes||{})e.setAttribute(k,o.attributes[k]);e.addEventListener('load',function(){e.__c15tDone='load'});e.addEventListener('error',function(){e.__c15tDone='error'});s[id]=e;var g=e.__c15tInsert=function(){if(e.__c15tInsert!==g)return;delete e.__c15tInsert;if(!e.__c15tAdopted&&z()){e.__c15tHeld=true;return}(o.target==='body'?document.body||document.head:document.head).appendChild(e)};w(g)}`;

const AFTER_FIRST_PAINT =
	'document.hidden?r():requestAnimationFrame(function(){setTimeout(r)})';

const seedOf = function seedOf(snapshot: ConsentSnapshot): {
	categories: Record<string, [boolean, number]>;
	earliest: number | null;
	vendorsAt: number;
} {
	const categories: Record<string, [boolean, number]> = {};
	const times: number[] = [];
	for (const [category, decision] of Object.entries(
		snapshot.explicitChoice?.categories ?? {}
	)) {
		if (decision) {
			categories[category] = [decision.value, decision.confirmedAt];
			times.push(decision.confirmedAt);
		}
	}
	const vendorsAt = snapshot.vendorChoice?.confirmedAt ?? -1;
	if (snapshot.vendorChoice) {
		times.push(vendorsAt);
	}
	return {
		categories,
		earliest: times.length > 0 ? Math.min(...times) : null,
		vendorsAt,
	};
};

const newerStoredDecision = function newerStoredDecision(
	snapshot: ConsentSnapshot,
	keys: ReturnType<typeof resolveStorageKeys>
): string {
	const seed = seedOf(snapshot);
	const { gpc } = snapshot.privacySignals;
	const gpcCheck =
		gpc.override === undefined && !gpc.active
			? 'try{if(navigator.globalPrivacyControl===true)return true}catch(x){}'
			: '';
	const names = Object.fromEntries(
		CATEGORY_CODES.map(([category, code]) => [code, category])
	);
	const subject = SUBJECT_CODES.map(([, code]) => code);
	const fields = {
		c: [...subject, ...IAB_CODES.map(([, code]) => code), 'b'],
		v: [...subject, 'd'],
	};
	return `var D=${inlineJSON(snapshot.nextDeadline)},S=${inlineJSON(seed.categories)},V=${seed.vendorsAt},M=${inlineJSON(seed.earliest)},N=${inlineJSON(names)},F=${inlineJSON(fields)},K=${inlineJSON({ consent: keys.consent, epoch: keys.epoch, legacyConsent: keys.legacyConsent, vendors: keys.vendors })},z=function(){${gpcCheck}if(D!==null&&!(Date.now()<D))return true;var c=function(n){try{for(var a=document.cookie.split(/;\\s*/),j=0;j<a.length;j++){var m=a[j].indexOf('=');if(a[j].slice(0,m)===n){var v=a[j].slice(m+1);if(v.indexOf('v=')&&v.indexOf('%')>=0)try{v=decodeURIComponent(v)}catch(x){}return v}}}catch(x){}return null},l=function(n){try{return localStorage.getItem(n)}catch(x){return null}},d=function(n,v,t){var s=S[n];return v!==true&&(!s||!(t<=s[1])||t===s[1]&&s[0])},e=function(t){return M!==null&&!(+t<M)},o=function(v,f){try{v=JSON.parse(v)}catch(x){return true}return!v||typeof v!=='object'||f(v)},p=function(v,h,f){if(v===null||v==='')return false;v=v.split('&');if(v[0]!==h)return true;for(var u=[],j=1;j<v.length;j++){var m=v[j].indexOf('='),k=v[j].slice(0,m);if(m<1||u.indexOf(k)>=0||f(k,v[j].slice(m+1)))return true;u.push(k)}return false},r=function(v,f){return v!==null&&v!==''&&o(v,f)},a=c(K.consent),b=l(K.consent),g;if(p(a,'v=3',function(k,v){if(k==='e')return e(v);if(N.hasOwnProperty(k)){if(!/^[01]\\.\\d+\\.\\d+$/.test(v))return true;v=v.split('.');return d(N[k],v[0]==='1',+v[1])}return F.c.indexOf(k)<0})||r(b,function(v){if(v.version!==3||v.epoch&&e(v.epoch))return true;for(g in v.categories||{})if(v.categories[g]&&d(g,v.categories[g].value,+v.categories[g].confirmedAt))return true})||!(a&&M!==null)&&K.legacyConsent&&l(K.legacyConsent))return true;if(p(c(K.vendors),'v=1',function(k,v){return k==='t'?!(+v<=V):F.v.indexOf(k)<0})||r(l(K.vendors),function(v){return v.version!==1||!(+v.confirmedAt<=V)}))return true;a=[c(K.epoch),l(K.epoch)];for(g=0;g<2;g++)if(a[g]&&e(a[g]))return true;return false};if(z())return;`;
};

const resourceOf = (script: Script): string => script.resourceKey ?? script.id;

const sharedResources = function sharedResources(
	scripts: ServerRunnable['scripts']
): Set<string> {
	const owners = new Map<string, string>();
	const shared = new Set<string>();
	for (const { script } of scripts) {
		const owner = owners.get(resourceOf(script));
		if (owner === undefined) {
			owners.set(resourceOf(script), script.id);
		} else if (owner !== script.id) {
			shared.add(resourceOf(script));
		}
	}
	return shared;
};

const serverStartCandidates = function serverStartCandidates(
	options: ServerScriptOptions
): Script[] {
	if (options.scriptLoader?.serverStart === false) {
		return [];
	}
	const elementScripts = (options.scripts ?? []).filter(
		(script) => !script.callbackOnly
	);
	return elementScripts.some((script) => script.serverStart && script.src)
		? elementScripts
		: [];
};

export const serverScriptStart = function serverScriptStart(
	options: ServerScriptOptions
): string | undefined {
	const { scripts, snapshot } = serverRunnableScripts(
		options,
		serverStartCandidates(options)
	);
	if (
		!snapshot ||
		scripts.length === 0 ||
		snapshot.promptRequirement.kind !== 'none'
	) {
		return;
	}
	const consents = getEffectiveGateState(snapshot).effectivePermissions;
	const denied = snapshot.model === 'iab' ? null : deniedVendorIds(snapshot);
	const preludes = new Set<string>();
	const starts: string[] = [];
	const shared = sharedResources(scripts);
	const keys = new Set<string>();
	for (const { hasConsent, script } of scripts) {
		const key = resourceOf(script);
		if (keys.has(key) || shared.has(key)) {
			continue;
		}
		keys.add(key);
		if (!(script.serverStart && script.src)) {
			continue;
		}
		let start: ReturnType<NonNullable<Script['serverStart']>>;
		try {
			start = script.serverStart?.(
				{
					consents,
					hasConsent,
					id: script.id,
					vendor:
						script.vendor && snapshot.model !== 'iab'
							? { granted: !denied?.has(script.vendor), id: script.vendor }
							: undefined,
				},
				script
			);
		} catch {
			continue;
		}
		if (!start) {
			continue;
		}
		if (start.prelude) {
			preludes.add(start.prelude);
		}
		const insertOptions = {
			async: script.async,
			attributes: script.attributes,
			consent: hasConsent,
			defer: script.defer,
			fetchPriority: script.fetchPriority,
			nonce: script.nonce,
			script: script.id,
			target: script.target,
		};
		starts.push(
			`try{if(!s[${inlineJSON(key)}]){${start.code};i(${inlineJSON(key)},${inlineJSON(script.src)},${inlineJSON(insertOptions)})}}catch(x){}`
		);
	}
	if (starts.length === 0) {
		return;
	}
	return `(function(){var n=document.currentScript&&document.currentScript.nonce,r=function(){if(window.__c15tLoaderRan)return;${newerStoredDecision(snapshot, resolveStorageKeys(storageFor(options)))}var s=window.__c15tStarted=window.__c15tStarted||{},w=${AFTER_PRIORITY_IMAGES},i=${INSERT_SCRIPT};${[...preludes].join(';')};${starts.join('')}};${AFTER_FIRST_PAINT}})()`;
};
