package demo.orders;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Demo scenario: Spring Data repository with a derived query. */
public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByStatus(String status);
}
