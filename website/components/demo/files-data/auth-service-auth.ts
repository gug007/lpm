// The internal/auth package: signing, verification and key rotation. Every
// transcript, diff and action in this project is about these four files, so
// they live apart from the project's scaffolding.
export const AUTH_PACKAGE: Record<string, string> = {
  "internal/auth/keys.go": `package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"time"
)

type signingKey struct {
	KID         string
	IssuedAt    time.Time
	RetireAfter time.Time
	priv        ed25519.PrivateKey
}

func (k signingKey) Public() ed25519.PublicKey {
	return k.priv.Public().(ed25519.PublicKey)
}

func newSigningKey() (signingKey, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return signingKey{}, err
	}
	return signingKey{
		KID:      base64.RawURLEncoding.EncodeToString(pub[:8]),
		IssuedAt: time.Now(),
		priv:     priv,
	}, nil
}

type KeySet []signingKey

func (s KeySet) Active() signingKey { return s[0] }

func (s KeySet) ByID(kid string) (signingKey, bool) {
	for _, k := range s {
		if k.KID == kid {
			return k, true
		}
	}
	return signingKey{}, false
}

type Manager struct {
	keys        KeySet
	activeKID   string
	graceWindow time.Duration
	store       Store
}
`,
  "internal/auth/rotation.go": `package auth

import (
	"context"
	"fmt"
	"time"
)

// Rotate mints a new signing key and makes it the active one. The keys it
// replaces stay in the set until their grace window closes, so a token signed
// a second before the rotation still verifies.
func (m *Manager) Rotate(ctx context.Context, now time.Time) error {
	if m.graceWindow == 0 {
		m.graceWindow = 24 * time.Hour
	}

	next, err := newSigningKey()
	if err != nil {
		return fmt.Errorf("rotate signing key: %w", err)
	}
	// Give the outgoing key a deadline instead of dropping it, so tokens it
	// already signed keep verifying until they expire on their own.
	for i := range m.keys {
		if m.keys[i].RetireAfter.IsZero() {
			m.keys[i].RetireAfter = now.Add(m.graceWindow)
		}
	}
	m.keys = append([]signingKey{next}, m.unexpired(now)...)
	m.activeKID = next.KID
	return m.store.Put(ctx, m.keys)
}

// Due reports whether the active key is old enough to be replaced.
func (m *Manager) Due(now time.Time, every time.Duration) bool {
	active, ok := m.keys.ByID(m.activeKID)
	if !ok {
		return true
	}
	return now.Sub(active.IssuedAt) >= every
}

// unexpired keeps the keys still inside their grace window.
func (m *Manager) unexpired(now time.Time) []signingKey {
	kept := make([]signingKey, 0, len(m.keys))
	for _, k := range m.keys {
		if now.Before(k.RetireAfter) {
			kept = append(kept, k)
		}
	}
	return kept
}
`,
  "internal/auth/jwt.go": `package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// Access tokens are short; the refresh token is what survives a restart.
	accessTTL  = 15 * time.Minute
	refreshTTL = 30 * 24 * time.Hour
)

// Claims is the payload every access token carries. Anything added here has to
// stay backwards compatible: tokens signed by the previous release are still
// in flight for accessTTL after a deploy.
type Claims struct {
	jwt.RegisteredClaims

	UserID  string \`json:"uid"\`
	Session string \`json:"sid"\`
	Scopes  []string \`json:"scp,omitempty"\`
	Device  string   \`json:"dev,omitempty"\`
}

// Valid is called by the parser after the signature checks out.
func (c *Claims) Valid() error {
	if c.UserID == "" {
		return ErrInvalidToken
	}
	if c.Session == "" {
		return ErrInvalidToken
	}
	return nil
}

func (c *Claims) HasScope(want string) bool {
	for _, s := range c.Scopes {
		if s == want || s == "*" {
			return true
		}
	}
	return false
}

// Issue signs a new access token with whichever key is currently active. The
// key id rides in the header so Parse can find it again after a rotation.
func Issue(keys *KeySet, userID, session, device string, scopes []string) (string, error) {
	if len(*keys) == 0 {
		return "", ErrNoSigningKey
	}
	active := keys.Active()
	now := time.Now()

	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "auth-service",
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTTL)),
		},
		UserID:  userID,
		Session: session,
		Scopes:  scopes,
		Device:  device,
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = active.KID
	return tok.SignedString(active.priv)
}

// IssueRefresh mints the long-lived half of the pair. It is opaque to the
// client and only ever exchanged at /v1/session/refresh.
func IssueRefresh(keys *KeySet, session string) (string, error) {
	if len(*keys) == 0 {
		return "", ErrNoSigningKey
	}
	active := keys.Active()
	now := time.Now()

	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "auth-service",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(refreshTTL)),
		},
		Session: session,
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = active.KID
	return tok.SignedString(active.priv)
}

// Parse verifies a token against the whole key set, not just the active key:
// after a rotation the signing key that produced it may already have been
// replaced, and it stays valid until its grace window closes.
func Parse(raw string, keys *KeySet) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		key, ok := keys.ByID(kid)
		if !ok {
			return nil, ErrUnknownKeyID
		}
		return key.Public(), nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, ErrInvalidToken
	}
	if errors.Is(claims.Valid(), ErrInvalidToken) {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
`,
  "internal/auth/errors.go": `package auth

import "errors"

var (
	ErrInvalidToken = errors.New("auth: invalid token")
	ErrUnknownKeyID = errors.New("auth: unknown key id")
	ErrNoSigningKey = errors.New("auth: no signing key")
	ErrSessionGone  = errors.New("auth: session revoked")
)
`,
};
