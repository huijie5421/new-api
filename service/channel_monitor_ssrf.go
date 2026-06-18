package service

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// SSRFProtectedDialer creates a net.Dialer with SSRF protection
func SSRFProtectedDialer(timeout time.Duration) *net.Dialer {
	return &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
		Control:   dialControl,
	}
}

// dialControl implements SSRF protection at dial time
func dialControl(network, address string, c net.Conn) error {
	if !SSRFBlockPrivateNetworks {
		return nil
	}

	// Re-resolve DNS to prevent DNS rebinding attacks
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid address: %w", err)
	}

	// Resolve the hostname
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("DNS lookup failed: %w", err)
	}

	// Check each resolved IP against blocked CIDRs
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("blocked IP address: %s (SSRF protection)", ip.String())
		}
	}

	return nil
}

// isBlockedIP checks if an IP is in the blocked CIDR list
func isBlockedIP(ip net.IP) bool {
	for _, cidrStr := range SSRFBlockedCIDRs {
		_, cidr, err := net.ParseCIDR(cidrStr)
		if err != nil {
			continue
		}
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateEndpoint performs pre-check validation of the endpoint
func ValidateEndpoint(endpoint string) error {
	if endpoint == "" {
		return fmt.Errorf("endpoint cannot be empty")
	}

	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		return fmt.Errorf("endpoint must start with http:// or https://")
	}

	return nil
}

// ResolveAndCheckHost resolves and validates a host before making a request
func ResolveAndCheckHost(host string) error {
	if !SSRFBlockPrivateNetworks {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resolver := &net.Resolver{}
	ips, err := resolver.LookupIP(ctx, "ip", host)
	if err != nil {
		return fmt.Errorf("failed to resolve host: %w", err)
	}

	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("host resolves to blocked IP: %s (SSRF protection)", ip.String())
		}
	}

	return nil
}
