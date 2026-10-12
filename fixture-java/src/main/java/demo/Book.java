package demo;

import java.math.BigDecimal;
import java.util.Objects;

public record Book(String isbn, String title, String author, BigDecimal price, int stock) {
    public Book {
        Objects.requireNonNull(isbn);
        Objects.requireNonNull(title);
        Objects.requireNonNull(author);
        Objects.requireNonNull(price);
        if (isbn.isBlank() || title.isBlank() || author.isBlank()) throw new IllegalArgumentException("text fields must not be blank");
        if (price.signum() < 0 || stock < 0) throw new IllegalArgumentException("price and stock must not be negative");
    }
}
