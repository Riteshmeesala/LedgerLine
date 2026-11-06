package com.ledgerline.security;

import com.ledgerline.model.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationMinutes;

    public JwtService(
            @Value("${ledgerline.jwt.secret}") String secret,
            @Value("${ledgerline.jwt.expiration-minutes:15}") long expirationMinutes) {
        byte[] keyBytes = secret != null ? secret.getBytes(StandardCharsets.UTF_8) : new byte[0];
        if (keyBytes.length < 32) {
            throw new IllegalStateException("Security Fatal: JWT_SECRET must be configured and contain at least 32 bytes (256 bits) for HS256 compliance.");
        }
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMinutes = expirationMinutes;
    }

    public String generateToken(UUID userId, UserRole role) {
        Instant now = Instant.now();
        Instant expiry = now.plus(expirationMinutes, ChronoUnit.MINUTES);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("role", role.name())
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    public Claims parseAndValidateClaims(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            throw new IllegalArgumentException("Token has expired", e);
        } catch (JwtException | IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid or tampered token: " + e.getMessage(), e);
        }
    }

    public UUID extractUserId(String token) {
        Claims claims = parseAndValidateClaims(token);
        return UUID.fromString(claims.getSubject());
    }

    public UserRole extractRole(String token) {
        Claims claims = parseAndValidateClaims(token);
        return UserRole.valueOf(claims.get("role", String.class));
    }
}

