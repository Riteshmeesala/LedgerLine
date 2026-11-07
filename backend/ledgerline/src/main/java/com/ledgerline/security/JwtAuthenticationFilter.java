package com.ledgerline.security;

import com.ledgerline.model.UserRole;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final JdbcTemplate jdbcTemplate;

    public JwtAuthenticationFilter(JwtService jwtService, JdbcTemplate jdbcTemplate) {
        this.jwtService = jwtService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String jwt = authHeader.substring(7).trim();
        try {
            UUID userId = jwtService.extractUserId(jwt);
            UserRole tokenRole = jwtService.extractRole(jwt);

            // Rule: Check on every request that the user still exists and is enabled
            UserPrincipal userPrincipal = jdbcTemplate.queryForObject(
                    "SELECT id, email, password_hash, role, enabled FROM users WHERE id = ?",
                    (rs, rowNum) -> new UserPrincipal(
                            (UUID) rs.getObject("id"),
                            rs.getString("email"),
                            rs.getString("password_hash"),
                            UserRole.valueOf(rs.getString("role")),
                            rs.getBoolean("enabled")
                    ),
                    userId
            );

            if (userPrincipal != null && userPrincipal.isEnabled() && userPrincipal.getRole() == tokenRole) {
                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userPrincipal,
                        null,
                        userPrincipal.getAuthorities()
                );
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            } else {
                SecurityContextHolder.clearContext();
            }
        } catch (EmptyResultDataAccessException e) {
            // User was deleted or does not exist in DB -> reject token
            SecurityContextHolder.clearContext();
        } catch (Exception e) {
            // Invalid signature, malformed, expired, or alg=none -> reject token
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }
}

