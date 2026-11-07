package com.ledgerline.config;

import com.ledgerline.model.UserRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseSeeder.class);

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;

    @Value("${ledgerline.seed.admin-password:}")
    private String adminPassword;

    @Value("${ledgerline.seed.auditor-password:}")
    private String auditorPassword;

    @Value("${ledgerline.seed.holder1-password:}")
    private String holder1Password;

    @Value("${ledgerline.seed.holder2-password:}")
    private String holder2Password;

    public DatabaseSeeder(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedUserIfConfigured("admin@ledgerline.local", adminPassword, UserRole.ADMIN, null);
        seedUserIfConfigured("auditor@ledgerline.local", auditorPassword, UserRole.AUDITOR, null);
        seedUserIfConfigured("holder1@ledgerline.local", holder1Password, UserRole.HOLDER, "Holder 1 Checking");
        seedUserIfConfigured("holder2@ledgerline.local", holder2Password, UserRole.HOLDER, "Holder 2 Checking");
    }

    private void seedUserIfConfigured(String email, String rawPassword, UserRole role, String accountName) {
        if (rawPassword == null || rawPassword.trim().isEmpty()) {
            return;
        }

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                Integer.class,
                email.toLowerCase().trim()
        );

        if (count != null && count > 0) {
            log.info("Seed account {} already exists. Skipping insertion.", email);
            return;
        }

        UUID userId = UUID.randomUUID();
        String hash = passwordEncoder.encode(rawPassword.trim());
        Instant now = Instant.now();

        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, ?, ?, TRUE, 0, ?)",
                userId, email.toLowerCase().trim(), hash, role.name(), Timestamp.from(now)
        );
        log.info("Provisioned initial seed user: {} (Role: {})", email, role.name());

        if (accountName != null && role == UserRole.HOLDER) {
            UUID accountId = UUID.randomUUID();
            jdbcTemplate.update(
                    "INSERT INTO accounts (id, owner_id, type, name, balance, version, status, created_at) VALUES (?, ?, 'CUSTOMER', ?, 0, 0, 'ACTIVE', ?)",
                    accountId, userId, accountName, Timestamp.from(now)
            );
            log.info("Provisioned customer checking account: {} for {}", accountName, email);
        }
    }
}

