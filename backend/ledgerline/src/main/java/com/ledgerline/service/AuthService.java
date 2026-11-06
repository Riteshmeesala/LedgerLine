package com.ledgerline.service;

import com.ledgerline.dto.AuthResponse;
import com.ledgerline.dto.CreateUserRequest;
import com.ledgerline.dto.LoginRequest;
import com.ledgerline.dto.RegisterRequest;
import com.ledgerline.dto.UserResponse;
import com.ledgerline.exception.ConflictException;
import com.ledgerline.model.UserRole;
import com.ledgerline.security.JwtService;
import com.ledgerline.security.RateLimitService;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class AuthService {

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RateLimitService rateLimitService;

    // Dummy hash for constant-time comparison when email is not found
    private static final String DUMMY_HASH = "$2a$12$e8xL4hM45cIuR7w2xK5.4.mE9oQ31L8mS5vU3kL6yY7zW9x1v2b3u";

    public AuthService(
            JdbcTemplate jdbcTemplate,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RateLimitService rateLimitService) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.rateLimitService = rateLimitService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, String clientIp) {
        rateLimitService.checkRateLimit("register:" + clientIp, 20, 60);

        // Security Rule: Register always creates HOLDER and rejects any client-supplied role
        if (request.getRole() != null && !request.getRole().trim().isEmpty()) {
            throw new IllegalArgumentException("Specifying a role during registration is strictly prohibited.");
        }

        Integer existingCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                Integer.class,
                request.getEmail().toLowerCase().trim()
        );

        if (existingCount != null && existingCount > 0) {
            throw new ConflictException("Email already registered");
        }

        UUID userId = UUID.randomUUID();
        String hashedPassword = passwordEncoder.encode(request.getPassword());

        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, ?, 'HOLDER', TRUE, 0, ?)",
                userId, request.getEmail().toLowerCase().trim(), hashedPassword, Timestamp.from(Instant.now())
        );

        String token = jwtService.generateToken(userId, UserRole.HOLDER);
        return new AuthResponse(token, userId, request.getEmail().toLowerCase().trim(), UserRole.HOLDER);
    }

    @Transactional(noRollbackFor = BadCredentialsException.class)
    public AuthResponse login(LoginRequest request, String clientIp) {
        rateLimitService.checkRateLimit("login:" + clientIp, 30, 60);

        String normalizedEmail = request.getEmail().toLowerCase().trim();

        try {
            var userData = jdbcTemplate.queryForMap(
                    "SELECT id, email, password_hash, role, enabled, failed_logins, locked_until FROM users WHERE email = ?",
                    normalizedEmail
            );

            UUID userId = (UUID) userData.get("id");
            String passwordHash = (String) userData.get("password_hash");
            UserRole role = UserRole.valueOf((String) userData.get("role"));
            boolean enabled = (Boolean) userData.get("enabled");
            int failedLogins = ((Number) userData.get("failed_logins")).intValue();
            Timestamp lockedUntil = (Timestamp) userData.get("locked_until");

            // Check lockout: 15 min lock after 5 failed logins
            if (lockedUntil != null && lockedUntil.toInstant().isAfter(Instant.now())) {
                throw new BadCredentialsException("Invalid credentials");
            }

            // Verify password
            boolean passwordMatches = passwordEncoder.matches(request.getPassword(), passwordHash);
            if (!passwordMatches || !enabled) {
                int newFailedCount = failedLogins + 1;
                Timestamp newLock = null;
                if (newFailedCount >= 5) {
                    newLock = Timestamp.from(Instant.now().plus(15, ChronoUnit.MINUTES));
                }
                jdbcTemplate.update(
                        "UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?",
                        newFailedCount, newLock, userId
                );
                throw new BadCredentialsException("Invalid credentials");
            }

            // Success: Reset failed logins counter
            jdbcTemplate.update(
                    "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?",
                    userId
            );

            String token = jwtService.generateToken(userId, role);
            return new AuthResponse(token, userId, normalizedEmail, role);

        } catch (EmptyResultDataAccessException e) {
            // Mitigate timing attacks & user enumeration: execute dummy hash comparison
            passwordEncoder.matches(request.getPassword(), DUMMY_HASH);
            throw new BadCredentialsException("Invalid credentials");
        }
    }

    @Transactional
    public UserResponse createUserByAdmin(CreateUserRequest request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                Integer.class,
                normalizedEmail
        );
        if (existing != null && existing > 0) {
            throw new ConflictException("Email already exists: " + normalizedEmail);
        }

        UUID userId = UUID.randomUUID();
        String hash = passwordEncoder.encode(request.getPassword());

        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, ?, ?, TRUE, 0, ?)",
                userId, normalizedEmail, hash, request.getRole().name(), Timestamp.from(Instant.now())
        );

        return new UserResponse(userId, normalizedEmail, request.getRole(), true);
    }
}

