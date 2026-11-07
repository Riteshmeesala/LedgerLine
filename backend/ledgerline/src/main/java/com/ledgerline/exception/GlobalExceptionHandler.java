package com.ledgerline.exception;

import com.ledgerline.security.UserPrincipal;
import com.ledgerline.service.AuditService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final MediaType PROBLEM_JSON = MediaType.parseMediaType("application/problem+json");

    private final AuditService auditService;

    public GlobalExceptionHandler(AuditService auditService) {
        this.auditService = auditService;
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleAuthentication(AuthenticationException ex) {
        logSecurityFailure("AUTHENTICATION_FAILED", "AUTH", "AUTH", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.UNAUTHORIZED, "Unauthorized", ex.getMessage());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        logSecurityFailure("ACCESS_DENIED", "ACCESS", "FORBIDDEN", Map.of("reason", "Forbidden"));
        return buildProblemResponse(HttpStatus.FORBIDDEN, "Forbidden", "You do not have permission to access this resource");
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(ResourceNotFoundException ex) {
        logSecurityFailure("RESOURCE_NOT_FOUND", "RESOURCE", "NOT_FOUND", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.NOT_FOUND, "Not Found", ex.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(ConflictException ex) {
        logSecurityFailure("CONFLICT", "RESOURCE", "CONFLICT", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.CONFLICT, "Conflict", ex.getMessage());
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimit(RateLimitExceededException ex) {
        logSecurityFailure("RATE_LIMIT_EXCEEDED", "RATE_LIMIT", "RATE_LIMIT", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.TOO_MANY_REQUESTS, "Too Many Requests", ex.getMessage());
    }

    @ExceptionHandler(InsufficientFundsException.class)
    public ResponseEntity<Map<String, Object>> handleInsufficientFunds(InsufficientFundsException ex) {
        logSecurityFailure("INSUFFICIENT_FUNDS", "ACCOUNT", "FUNDS", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, "Insufficient Funds", ex.getMessage());
    }

    @ExceptionHandler(IdempotencyMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleIdempotencyMismatch(IdempotencyMismatchException ex) {
        logSecurityFailure("IDEMPOTENCY_MISMATCH", "IDEMPOTENCY_KEY", "MISMATCH", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, "Idempotency Key Conflict", ex.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException ex) {
        logSecurityFailure("ILLEGAL_STATE", "ACCOUNT", "STATE", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, "Illegal State", ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        logSecurityFailure("ILLEGAL_ARGUMENT", "VALIDATION", "ARGUMENT", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, "Unprocessable Entity", ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        String detail = "Failed to convert parameter '" + ex.getName() + "' to required type";
        logSecurityFailure("TYPE_MISMATCH", "REQUEST", "PARAMETER", Map.of("reason", detail));
        return buildProblemResponse(HttpStatus.UNPROCESSABLE_ENTITY, "Unprocessable Entity", detail);
    }

    @ExceptionHandler(PayloadTooLargeException.class)
    public ResponseEntity<Map<String, Object>> handlePayloadTooLarge(PayloadTooLargeException ex) {
        logSecurityFailure("PAYLOAD_TOO_LARGE", "REQUEST", "SIZE", Map.of("reason", ex.getMessage()));
        return buildProblemResponse(HttpStatus.PAYLOAD_TOO_LARGE, "Payload Too Large", ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGenericException(Exception ex) {
        logSecurityFailure("INTERNAL_ERROR", "SERVER", "SYSTEM", Map.of("reason", "Internal error"));
        return buildProblemResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", "An unexpected internal error occurred.");
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            org.springframework.http.converter.HttpMessageNotReadableException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        Throwable cause = ex.getCause();
        if (cause instanceof com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException upe) {
            String detail = "Unrecognized field: '" + upe.getPropertyName() + "'";
            logSecurityFailure("UNKNOWN_PROPERTY", "REQUEST", "PAYLOAD", Map.of("reason", detail));
            Map<String, Object> body = createProblemMap(HttpStatus.BAD_REQUEST, "Bad Request", detail);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(PROBLEM_JSON)
                    .body(body);
        }
        String detail = cause != null ? cause.getMessage() : ex.getMessage();
        logSecurityFailure("MALFORMED_INPUT", "REQUEST", "PAYLOAD", Map.of("reason", detail));
        Map<String, Object> body = createProblemMap(HttpStatus.UNPROCESSABLE_ENTITY, "Unprocessable Entity", detail);
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(PROBLEM_JSON)
                .body(body);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String details = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));

        logSecurityFailure("VALIDATION_FAILED", "REQUEST", "VALIDATION", Map.of("reason", details));
        Map<String, Object> body = createProblemMap(HttpStatus.UNPROCESSABLE_ENTITY, "Validation Failed", details);
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(PROBLEM_JSON)
                .body(body);
    }

    private void logSecurityFailure(String action, String entityType, String entityId, Map<String, Object> details) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            UUID actorId = null;
            String actorRole = "ANONYMOUS";
            if (auth != null && auth.getPrincipal() instanceof UserPrincipal principal) {
                actorId = principal.getId();
                actorRole = principal.getRole() != null ? principal.getRole().name() : "USER";
            }
            auditService.logSecurityEvent(actorId, actorRole, action, entityType, entityId, details, null);
        } catch (Exception ignored) {
            // Audit failure in exception handler must not mask the original response
        }
    }

    private ResponseEntity<Map<String, Object>> buildProblemResponse(HttpStatus status, String title, String detail) {
        Map<String, Object> body = createProblemMap(status, title, detail);
        return ResponseEntity.status(status)
                .contentType(PROBLEM_JSON)
                .body(body);
    }

    private Map<String, Object> createProblemMap(HttpStatus status, String title, String detail) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", title);
        body.put("status", status.value());
        body.put("detail", detail);
        body.put("timestamp", Instant.now().toString());
        return body;
    }
}

