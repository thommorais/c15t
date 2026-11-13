// A local vendor stand-in. The browser tests verify that this request waits
// for measurement consent and that revocation clears its stored data.
localStorage.setItem('demo:measurement', 'loaded')
window.dispatchEvent(new Event('demo:measurement-loaded'))
