package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-shadowed — NEGATIVE. Parameter shadows the repository field with a non-repository type. */
@Service
public class LoopShadowedCase {

    private final LoopShadowedOrderRepository orderRepository;

    public LoopShadowedCase(LoopShadowedOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void describe(List<LoopShadowedOrder> orders, String orderRepository) {
        for (LoopShadowedOrder order : orders) {
            orderRepository.trim();
        }
    }
}

interface LoopShadowedOrderRepository extends JpaRepository<LoopShadowedOrder, Long> {
}

class LoopShadowedOrder {
}
