package com.ledgerline.config;

import com.ledgerline.model.UserRole;
import com.ledgerline.service.MoneyEngineService;
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
    private final MoneyEngineService moneyEngineService;

    @Value("${ledgerline.seed.admin-password:}")
    private String adminPassword;

    @Value("${ledgerline.seed.auditor-password:}")
    private String auditorPassword;

    @Value("${ledgerline.seed.holder1-password:}")
    private String holder1Password;

    @Value("${ledgerline.seed.holder2-password:}")
    private String holder2Password;

    public DatabaseSeeder(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder, MoneyEngineService moneyEngineService) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.moneyEngineService = moneyEngineService;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedUserIfConfigured("admin@ledgerline.local", adminPassword, UserRole.ADMIN, null, 0L);
        seedUserIfConfigured("auditor@ledgerline.local", auditorPassword, UserRole.AUDITOR, null, 0L);
        seedUserIfConfigured("holder1@ledgerline.local", holder1Password, UserRole.HOLDER, "Holder 1 Checking", 150000L);
        seedUserIfConfigured("holder2@ledgerline.local", holder2Password, UserRole.HOLDER, "Holder 2 Checking", 50000L);
    }

    private void seedUserIfConfigured(String email, String rawPassword, UserRole role, String accountName, long initialDepositMinor) {
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

            if (initialDepositMinor > 0) {
                try {
                    String seedIdemKey = "seed-deposit-" + accountId.toString().substring(0, 16);
                    moneyEngineService.executeTransfer(
                            userId,
                            "POST",
                            "/api/accounts/" + accountId + "/deposits",
                            seedIdemKey,
                            MoneyEngineService.CASH_IN_OUT_ACCOUNT_ID,
                            accountId,
                            initialDepositMinor,
                            "DEPOSIT"
                    );
                    log.info("Seeded verified initial deposit of {} paise for account {}", initialDepositMinor, accountId);
                } catch (Exception e) {
                    log.warn("Could not execute initial seed deposit for {}: {}", email, e.getMessage());
                }
            }
        }
    }
}

