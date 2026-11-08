package com.ledgerline.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.dto.CreateAccountRequest;
import com.ledgerline.dto.LoginRequest;
import com.ledgerline.dto.RegisterRequest;
import com.ledgerline.model.UserRole;
import com.ledgerline.security.JwtService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class AuthAndAuthorizationSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RequestMappingHandlerMapping requestMappingHandlerMapping;

    @Value("${ledgerline.jwt.secret}")
    private String jwtSecret;

    private String holderTokenA;
    private UUID holderIdA;
    private UUID accountIdA;

    private String holderTokenB;
    private UUID holderIdB;
    private UUID accountIdB;

    private String adminToken;
    private UUID adminId;

    @BeforeEach
    void setUp() throws Exception {
        // Create Holder A
        UUID dummyA = UUID.randomUUID();
        String emailA = "holder-a-" + dummyA + "@test.com";
        registerUser(emailA, "Password123!");
        holderTokenA = loginUser(emailA, "Password123!");
        holderIdA = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, emailA);
        accountIdA = createAccount(holderTokenA, "Holder A Account");

        // Create Holder B
        UUID dummyB = UUID.randomUUID();
        String emailB = "holder-b-" + dummyB + "@test.com";
        registerUser(emailB, "Password123!");
        holderTokenB = loginUser(emailB, "Password123!");
        holderIdB = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, emailB);
        accountIdB = createAccount(holderTokenB, "Holder B Account");

        // Create Admin
        adminId = UUID.randomUUID();
        String adminEmail = "admin-" + adminId + "@test.com";
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, '$2a$12$e8xL4hM45cIuR7w2xK5.4.mE9oQ31L8mS5vU3kL6yY7zW9x1v2b3u', 'ADMIN', TRUE, 0, ?)",
                adminId, adminEmail, Timestamp.from(Instant.now())
        );
        adminToken = jwtService.generateToken(adminId, UserRole.ADMIN);
    }

    @Test
    @DisplayName("Security Rule: Unauthenticated requests get 401 on every mapped protected route")
    void unauthenticatedRequestsGet401OnEveryMappedProtectedRoute() throws Exception {
        Set<String> publicPaths = Set.of("/api/health", "/api/auth/register", "/api/auth/login");

        requestMappingHandlerMapping.getHandlerMethods().forEach((info, method) -> {
            Set<String> patterns = info.getPatternValues();
            Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();

            for (String pattern : patterns) {
                if (publicPaths.contains(pattern)) {
                    continue;
                }

                // Replace path variables e.g. {id} with a dummy UUID
                String testUri = pattern.replaceAll("\\{[^}]+\\}", UUID.randomUUID().toString());
                String httpMethod = methods.isEmpty() ? "GET" : methods.iterator().next().name();

                MockHttpServletRequestBuilder builder;
                switch (httpMethod) {
                    case "POST" -> builder = post(testUri).contentType(MediaType.APPLICATION_JSON).content("{}");
                    case "PUT" -> builder = put(testUri).contentType(MediaType.APPLICATION_JSON).content("{}");
                    case "DELETE" -> builder = delete(testUri);
                    default -> builder = get(testUri);
                }

                try {
                    mockMvc.perform(builder)
                            .andExpect(status().isUnauthorized())
                            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                            .andExpect(jsonPath("$.status").value(401));
                } catch (Exception e) {
                    throw new RuntimeException("Route " + httpMethod + " " + testUri + " failed 401 check", e);
                }
            }
        });
    }

    @Test
    @DisplayName("Security Rule: Expired token is rejected with 401 Unauthorized")
    void expiredTokenIsRejectedWith401Unauthorized() throws Exception {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        Instant past = Instant.now().minus(30, ChronoUnit.MINUTES);

        String expiredToken = Jwts.builder()
                .subject(holderIdA.toString())
                .claim("role", "HOLDER")
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(past.minus(15, ChronoUnit.MINUTES)))
                .expiration(Date.from(past))
                .signWith(key, Jwts.SIG.HS256)
                .compact();

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + expiredToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security Rule: Tampered token payload is rejected with 401 Unauthorized")
    void tamperedTokenPayloadIsRejectedWith401Unauthorized() throws Exception {
        String[] parts = holderTokenA.split("\\.");
        // Modify middle segment (payload)
        String tamperedToken = parts[0] + "." + parts[1] + "tamper" + "." + parts[2];

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + tamperedToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security Rule: Algorithm none (alg=none) token is rejected with 401 Unauthorized")
    void algNoneTokenIsRejectedWith401Unauthorized() throws Exception {
        String unsignedHeader = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String unsignedPayload = Base64.getUrlEncoder().withoutPadding().encodeToString(("{\"sub\":\"" + holderIdA + "\",\"role\":\"ADMIN\"}").getBytes(StandardCharsets.UTF_8));
        String algNoneToken = unsignedHeader + "." + unsignedPayload + ".";

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + algNoneToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security Rule: Token signed with wrong secret key is rejected with 401 Unauthorized")
    void wrongSignatureTokenIsRejectedWith401Unauthorized() throws Exception {
        SecretKey rogueKey = Keys.hmacShaKeyFor("a_completely_different_and_unauthorized_secret_key_123456789".getBytes(StandardCharsets.UTF_8));
        String forgedToken = Jwts.builder()
                .subject(holderIdA.toString())
                .claim("role", "ADMIN")
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 900000))
                .signWith(rogueKey, Jwts.SIG.HS256)
                .compact();

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + forgedToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security Rule: Deleted or non-existent user token is rejected on every request with 401")
    void deletedUserTokenIsRejectedOnEveryRequest() throws Exception {
        UUID tempUserId = UUID.randomUUID();
        String tempEmail = "temp-" + tempUserId + "@test.com";
        registerUser(tempEmail, "Password123!");
        String tempToken = loginUser(tempEmail, "Password123!");

        // Delete user directly from DB
        jdbcTemplate.update("DELETE FROM users WHERE email = ?", tempEmail);

        // Next request using this token must be rejected
        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + tempToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security Rule: Register cannot set role and rejects client-supplied role field")
    void registerCannotSetRoleAndRejectsClientSuppliedRole() throws Exception {
        RegisterRequest request = new RegisterRequest("hacker@test.com", "Password123!", "ADMIN");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status").value(422));

        // Verify user was NOT created in DB
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = 'hacker@test.com'", Integer.class
        );
        assertThat(count).isEqualTo(0);
    }

    @Test
    @DisplayName("Security Rule: HOLDER cannot reach admin or auditor routes (403 Forbidden)")
    void holderCannotReachAdminOrAuditorRoutes() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("Authorization", "Bearer " + holderTokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"x@x.com\",\"password\":\"P@ss1234\",\"role\":\"HOLDER\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Forbidden"));
    }

    @Test
    @DisplayName("Security Rule: IDOR matrix — HOLDER gets 404 on every account-scoped route for another holder's account")
    void idorMatrixHolderGets404OnEveryAccountScopedRouteForAnotherHoldersAccount() throws Exception {
        // Holder B attempts to access Holder A's account across all account-scoped routes:

        // 1. GET /api/accounts/{id} -> 404 Not Found (NEVER 403)
        mockMvc.perform(get("/api/accounts/" + accountIdA)
                        .header("Authorization", "Bearer " + holderTokenB))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // 2. POST /api/accounts/{id}/deposits -> 404 Not Found (NEVER 403)
        mockMvc.perform(post("/api/accounts/" + accountIdA + "/deposits")
                        .header("Authorization", "Bearer " + holderTokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // 3. POST /api/accounts/{id}/withdrawals -> 404 Not Found (NEVER 403)
        mockMvc.perform(post("/api/accounts/" + accountIdA + "/withdrawals")
                        .header("Authorization", "Bearer " + holderTokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 500}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    @DisplayName("Security Rule: Login lockout after 5 consecutive failed attempts for 15 minutes")
    void loginLockoutAfterFiveFailedAttempts() throws Exception {
        UUID lockoutUserId = UUID.randomUUID();
        String lockoutEmail = "lockout-" + lockoutUserId + "@test.com";
        registerUser(lockoutEmail, "CorrectPassword1!");

        LoginRequest badLogin = new LoginRequest(lockoutEmail, "WrongPassword1!");

        // 4 failed attempts
        for (int i = 0; i < 4; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(badLogin)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.detail").value("Invalid credentials"));
        }

        // 5th failed attempt triggers lock
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badLogin)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid credentials"));

        // 6th attempt WITH CORRECT PASSWORD is now rejected due to 15 min lockout
        LoginRequest correctLogin = new LoginRequest(lockoutEmail, "CorrectPassword1!");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(correctLogin)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid credentials"));
    }

    @Test
    @DisplayName("Security Rule: Login returns generic 'Invalid credentials' preventing user enumeration")
    void loginReturnsGenericInvalidCredentialsPreventingUserEnumeration() throws Exception {
        LoginRequest nonExistentUser = new LoginRequest("does-not-exist@test.com", "Password123!");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nonExistentUser)))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.detail").value("Invalid credentials"));
    }

    @Test
    @DisplayName("Feature 4: ADMIN freeze account without reason returns 400 Bad Request")
    void freezeAccountWithoutReasonReturns400BadRequest() throws Exception {
        // Missing body
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest());

        // Empty body or blank reason
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Feature 4: ADMIN freeze account with reason under 3 characters returns 400 Bad Request")
    void freezeAccountWithReasonUnder3CharsReturns400BadRequest() throws Exception {
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"no\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Feature 4: ADMIN freeze account with reason over 200 characters returns 400 Bad Request")
    void freezeAccountWithReasonOver200CharsReturns400BadRequest() throws Exception {
        String longReason = "A".repeat(201);
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"" + longReason + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Feature 4: ADMIN freeze and unfreeze with valid reason records audit_log entry with reason")
    void freezeAndUnfreezeWithValidReasonRecordsAuditLogRowWithReason() throws Exception {
        String freezeReason = "Suspected fraudulent activity reported by risk engine";
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"" + freezeReason + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FROZEN"));

        // Verify audit log has FREEZE_ACCOUNT with exact reason in payload
        List<Map<String, Object>> freezeLogs = jdbcTemplate.queryForList(
                "SELECT payload FROM audit_log WHERE action = 'FREEZE_ACCOUNT' AND entity_id = ? ORDER BY seq DESC LIMIT 1",
                accountIdA.toString()
        );
        assertThat(freezeLogs).isNotEmpty();
        assertThat(freezeLogs.get(0).get("payload").toString()).contains(freezeReason);

        String unfreezeReason = "Risk review completed and cleared by compliance officer";
        mockMvc.perform(post("/api/admin/accounts/{id}/unfreeze", accountIdA)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"" + unfreezeReason + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // Verify audit log has UNFREEZE_ACCOUNT with exact reason in payload
        List<Map<String, Object>> unfreezeLogs = jdbcTemplate.queryForList(
                "SELECT payload FROM audit_log WHERE action = 'UNFREEZE_ACCOUNT' AND entity_id = ? ORDER BY seq DESC LIMIT 1",
                accountIdA.toString()
        );
        assertThat(unfreezeLogs).isNotEmpty();
        assertThat(unfreezeLogs.get(0).get("payload").toString()).contains(unfreezeReason);
    }

    @Test
    @DisplayName("Feature 5: ADMIN can disable and re-enable user with audit logging")
    void adminCanDisableAndEnableUserWithAuditLog() throws Exception {
        // 1. Admin disables Holder A
        mockMvc.perform(post("/api/admin/users/{id}/disable", holderIdA)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        // Verify DB status
        Boolean isEnabled = jdbcTemplate.queryForObject(
                "SELECT enabled FROM users WHERE id = ?",
                Boolean.class,
                holderIdA
        );
        assertThat(isEnabled).isFalse();

        // Verify audit log has DISABLE_USER
        List<Map<String, Object>> disableLogs = jdbcTemplate.queryForList(
                "SELECT payload FROM audit_log WHERE action = 'DISABLE_USER' AND entity_id = ? ORDER BY seq DESC LIMIT 1",
                holderIdA.toString()
        );
        assertThat(disableLogs).isNotEmpty();

        // 2. Admin re-enables Holder A
        mockMvc.perform(post("/api/admin/users/{id}/enable", holderIdA)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        isEnabled = jdbcTemplate.queryForObject(
                "SELECT enabled FROM users WHERE id = ?",
                Boolean.class,
                holderIdA
        );
        assertThat(isEnabled).isTrue();

        // Verify audit log has ENABLE_USER
        List<Map<String, Object>> enableLogs = jdbcTemplate.queryForList(
                "SELECT payload FROM audit_log WHERE action = 'ENABLE_USER' AND entity_id = ? ORDER BY seq DESC LIMIT 1",
                holderIdA.toString()
        );
        assertThat(enableLogs).isNotEmpty();
    }

    @Test
    @DisplayName("Feature 5 Security: A disabled user's existing token is rejected with 401 on the next request")
    void disabledUserExistingTokenIsRejectedWith401OnNextRequest() throws Exception {
        // Holder B makes an initial successful call with their valid JWT
        mockMvc.perform(get("/api/accounts")
                        .header("Authorization", "Bearer " + holderTokenB))
                .andExpect(status().isOk());

        // Admin disables Holder B
        mockMvc.perform(post("/api/admin/users/{id}/disable", holderIdB)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        // The very next request made by Holder B with their existing token MUST return 401 Unauthorized
        mockMvc.perform(get("/api/accounts")
                        .header("Authorization", "Bearer " + holderTokenB))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Feature 5 Security: An administrator cannot disable their own account (HTTP 422)")
    void adminCannotDisableThemselvesReturns422() throws Exception {
        UUID otherAdminId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, '$2a$12$e8xL4hM45cIuR7w2xK5.4.mE9oQ31L8mS5vU3kL6yY7zW9x1v2b3u', 'ADMIN', TRUE, 0, ?)",
                otherAdminId, "other-admin-" + otherAdminId + "@test.com", Timestamp.from(Instant.now())
        );

        mockMvc.perform(post("/api/admin/users/{id}/disable", adminId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("An administrator cannot disable their own account"));
    }

    @Test
    @DisplayName("Feature 5 Security: The last active ADMIN cannot be disabled (HTTP 422)")
    void cannotDisableLastActiveAdminReturns422() throws Exception {
        // Disable all other admins so adminId is the sole active admin
        jdbcTemplate.update("UPDATE users SET enabled = false WHERE role = 'ADMIN' AND id != ?", adminId);

        mockMvc.perform(post("/api/admin/users/{id}/disable", adminId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Cannot disable the last active administrator"));
    }

    @Test
    @DisplayName("Feature 5 Security: HOLDER and AUDITOR cannot disable or enable users (HTTP 403)")
    void holderAndAuditorCannotDisableOrEnableUsersReturns403() throws Exception {
        mockMvc.perform(post("/api/admin/users/{id}/disable", holderIdA)
                        .header("Authorization", "Bearer " + holderTokenA))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/admin/users/{id}/enable", holderIdA)
                        .header("Authorization", "Bearer " + holderTokenA))
                .andExpect(status().isForbidden());
    }

    private void registerUser(String email, String password) throws Exception {
        RegisterRequest request = new RegisterRequest(email, password);
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private String loginUser(String email, String password) throws Exception {
        LoginRequest request = new LoginRequest(email, password);
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> map = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        return (String) map.get("token");
    }

    private UUID createAccount(String token, String name) throws Exception {
        CreateAccountRequest request = new CreateAccountRequest(name);
        MvcResult result = mockMvc.perform(post("/api/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<?, ?> map = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        return UUID.fromString((String) map.get("id"));
    }
}
