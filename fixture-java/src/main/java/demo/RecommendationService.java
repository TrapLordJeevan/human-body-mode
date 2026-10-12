package demo;

import java.util.Comparator;
import java.util.List;

public final class RecommendationService {
    public List<Book> availableByTitle(Catalog catalog) {
        return catalog.all().stream()
                .filter(book -> book.stock() > 0)
                .sorted(Comparator.comparing(Book::title))
                .toList();
    }
}
