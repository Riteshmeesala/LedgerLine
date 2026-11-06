package com.ledgerline;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.charset.StandardCharsets;

@SpringBootApplication
public class LedgerLineApplication {

    @Value("${ledgerline.jwt.secret}")
    private String jwtSecret;

    public static void main(String[] args) {
        SpringApplication.run(LedgerLineApplication.class, args);
    }

    @PostConstruct
    public void validateSecurityRequirements() {
        if (jwtSecret == null || jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                "Security Fatal: JWT_SECRET must be configured and contain at least 32 bytes (256 bits) for HS256 compliance."
            );
        }
    }
}

