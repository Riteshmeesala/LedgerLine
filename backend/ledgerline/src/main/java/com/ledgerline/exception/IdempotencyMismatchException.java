package com.ledgerline.exception;

public class IdempotencyMismatchException extends RuntimeException {
    public IdempotencyMismatchException(String message) {
        super(message);
    }
}

