package demo.orders;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Demo scenario: service with a transactional self-invocation and a repository loop. */
@Service
public class OrderService {

    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void place(Order order) {
        validate(order);
        save(order);
    }

    @Transactional
    public void save(Order order) {
        orderRepository.save(order);
    }

    public void restock(List<Order> orders) {
        for (Order order : orders) {
            orderRepository.save(order);
        }
    }

    public List<Order> openOrders() {
        return orderRepository.findByStatus("OPEN");
    }

    private void validate(Order order) {
    }
}
