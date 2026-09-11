package ratelimit

import (
	"testing"
	"time"
)

var start = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func TestAllowsUpToTheLimit(t *testing.T) {
	l := New(Rule{Limit: 3, Window: time.Minute})

	for i := range 3 {
		if !l.Allow("k", start) {
			t.Fatalf("request %d rejected inside the limit", i+1)
		}
	}
	if l.Allow("k", start) {
		t.Error("request past the limit was allowed")
	}
}

func TestWindowResets(t *testing.T) {
	l := New(Rule{Limit: 1, Window: time.Minute})

	if !l.Allow("k", start) {
		t.Fatal("first request rejected")
	}
	if l.Allow("k", start.Add(30*time.Second)) {
		t.Error("second request inside the window was allowed")
	}
	if !l.Allow("k", start.Add(time.Minute+time.Second)) {
		t.Error("request after the window was rejected")
	}
}

func TestKeysAreIndependent(t *testing.T) {
	l := New(Rule{Limit: 1, Window: time.Minute})

	if !l.Allow("a", start) {
		t.Fatal("first key rejected")
	}
	if !l.Allow("b", start) {
		t.Error("a second key was charged for the first key's usage")
	}
	if l.Allow("a", start) {
		t.Error("first key exceeded its own limit")
	}
}

func TestDisabledRuleAllowsEverything(t *testing.T) {
	l := New(Rule{Limit: 0, Window: time.Minute})

	for range 100 {
		if !l.Allow("k", start) {
			t.Fatal("a zero limit should disable rate limiting")
		}
	}
}

func TestRetryAfter(t *testing.T) {
	l := New(Rule{Limit: 1, Window: time.Minute})

	l.Allow("k", start)

	got := l.RetryAfter("k", start.Add(15*time.Second))
	if want := 45 * time.Second; got != want {
		t.Errorf("RetryAfter = %v, want %v", got, want)
	}

	if got := l.RetryAfter("unused", start); got != 0 {
		t.Errorf("RetryAfter for an unused key = %v, want 0", got)
	}
}

// Entries for keys that stop being used must not accumulate forever.
func TestExpiredEntriesArePruned(t *testing.T) {
	l := New(Rule{Limit: 1, Window: time.Minute})

	for i := range 50 {
		l.Allow(string(rune('a'+i%26))+string(rune('a'+i/26)), start)
	}
	if l.Size() == 0 {
		t.Fatal("expected tracked keys")
	}

	l.Allow("trigger", start.Add(time.Hour))

	if l.Size() > 1 {
		t.Errorf("tracked keys = %d, want stale entries pruned", l.Size())
	}
}
